import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** Minimal in-memory stand-in for the stepup_grants / admin_audit_log tables. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
function q(table: string) {
  const rows = () => (tables[table] ??= []);
  const filters: Array<(r: Row) => boolean> = [];
  let patch: Row | null = null;
  const api = {
    insert(r: Row) { rows().push({ used_at: null, ...r }); return Promise.resolve({ error: null }); },
    update(p: Row) { patch = p; return api; },
    eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return api; },
    is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return api; },
    gt(k: string, v: string) { filters.push((r) => String(r[k]) > v); return api; },
    select() { return api.then((x: unknown) => x); },
    then(res: (x: { data: Row[]; error: null }) => unknown) {
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (patch) for (const r of hit) Object.assign(r, patch);
      return Promise.resolve(res({ data: hit, error: null }));
    },
  };
  return api;
}
const db = { from: (t: string) => q(t) };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }));

import { friendlyMethods, toggleConfirmMode, togglePurpose } from '@/lib/platform/toggle-confirm';
import { createEmailCode, verifyEmailCode } from '@/lib/security-core/email-stepup';
import { consumeGrant, GRANT_TTL_MS, issueGrant, STEPUP_COOKIE } from '@/lib/auth/stepup';
import { hasToggleApproval } from '@/lib/ops/sensitive-stepup';
const G = { ttlMs: GRANT_TTL_MS, issueGrant, consumeGrant };

const req = (cookie: string | null, method = 'POST') => new Request('https://x.test/api', { method, headers: cookie ? { cookie: `${STEPUP_COOKIE}=${cookie}` } : {} });
const audit = () => (tables.admin_audit_log ?? []).map((r) => r.path);

beforeEach(() => { for (const k of Object.keys(tables)) delete tables[k]; });

describe('toggle re-confirmation mode (per product config)', () => {
  it('owned products are always strict and cannot be downgraded', () => {
    expect(toggleConfirmMode('nurawell')).toBe('strict');
    expect(toggleConfirmMode('sample')).toBe('strict');
    expect(toggleConfirmMode('nurawell', { nurawell: 'friendly' })).toBe('strict');
  });
  it('customer products default to friendly, and may opt into strict', () => {
    expect(toggleConfirmMode('acme', {}, {})).toBe('friendly');
    expect(toggleConfirmMode('acme', { acme: 'strict' }, {})).toBe('strict');
    expect(togglePurpose('strict')).toBe('ops.sensitive');
    expect(togglePurpose('friendly')).toBe('ops.modules');
  });
  it('offers passkey → TOTP → email, in that order', () => {
    expect(friendlyMethods({ passkeys: 1, totp: true, webauthn: true })).toEqual(['passkey', 'totp', 'email']);
    expect(friendlyMethods({ passkeys: 0, totp: true, webauthn: true })).toEqual(['totp', 'email']);
    expect(friendlyMethods({ passkeys: 2, totp: false, webauthn: false })).toEqual(['email']);
  });
});

describe('friendly step-up paths are server-verified and single-use', () => {
  it('passkey path: an ops.modules grant passes once', async () => {
    const g = await issueGrant(db as never, 'u1', 'ops.modules', 'passkey');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(g) }, 'friendly')).toBe(true);
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(g) }, 'friendly')).toBe(false);
    expect(audit()).toContain('stepup_granted');
  });
  it('TOTP path: grant bound to another user or purpose is rejected', async () => {
    const g = await issueGrant(db as never, 'u1', 'ops.modules', 'totp');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u2', req: req(g) }, 'friendly')).toBe(false);
    const s = await issueGrant(db as never, 'u1', 'ops.sensitive', 'totp');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(s) }, 'friendly')).toBe(false);
  });
  it('email path: right code once, wrong code / no nonce / old code fail, all audited', async () => {
    const first = await createEmailCode(G, db as never, 'u1', 'ops.modules');
    const { code, nonce } = await createEmailCode(G, db as never, 'u1', 'ops.modules');
    expect(await verifyEmailCode(G, db as never, 'u1', 'ops.modules', first.nonce, first.code)).toBeNull();
    expect(await verifyEmailCode(G, db as never, 'u1', 'ops.modules', null, code)).toBeNull();
    expect(await verifyEmailCode(G, db as never, 'u1', 'ops.modules', nonce, code === '000000' ? '111111' : '000000')).toBeNull();
    const grant = await verifyEmailCode(G, db as never, 'u1', 'ops.modules', nonce, code);
    expect(grant).toBeTruthy();
    expect(await verifyEmailCode(G, db as never, 'u1', 'ops.modules', nonce, code)).toBeNull();
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(grant) }, 'friendly')).toBe(true);
    expect(audit()).toEqual(expect.arrayContaining(['stepup_email_sent', 'stepup_email_failed', 'stepup_granted']));
  });
  it('expired codes fail (short TTL)', async () => {
    const { code, nonce } = await createEmailCode(G, db as never, 'u1', 'ops.modules');
    for (const r of tables.stepup_grants) r.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await verifyEmailCode(G, db as never, 'u1', 'ops.modules', nonce, code)).toBeNull();
  });
  it('GET never grants', async () => {
    const g = await issueGrant(db as never, 'u1', 'ops.modules', 'passkey');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(g, 'GET') }, 'friendly')).toBe(false);
  });
});

describe('strict mode is unchanged', () => {
  it('requires the ops.sensitive device approval; a friendly grant does not pass', async () => {
    const f = await issueGrant(db as never, 'u1', 'ops.modules', 'email_code');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(f) }, 'strict')).toBe(false);
    const s = await issueGrant(db as never, 'u1', 'ops.sensitive', 'phone_passkey');
    expect(await hasToggleApproval({ accessToken: null, userId: 'u1', req: req(s) }, 'strict')).toBe(true);
  });
  it('route wiring: email ops are rate-limited and allowed only for friendly products', () => {
    const src = readFileSync(join(__dirname, '../app/api/v1/ops/stepup/route.ts'), 'utf8');
    expect(src).toMatch(/if \(!friendly\) return NextResponse\.json\(\{ error: 'forbidden' \}/);
    expect(src).toContain("email_verify: { limit: 5");
    const toggle = readFileSync(join(__dirname, '../app/api/v1/ops/iam/modules/route.ts'), 'utf8');
    expect(toggle).toContain('toggleConfirmMode(p.data.productId)');
  });
});

describe('security upsell slot (config-driven)', async () => {
  const { upsellFor } = await import('@/lib/platform/toggle-confirm');
  const cfg = { c1: { label: 'שדרוג לאבטחה מתקדמת', href: 'https://example.com/security' } };
  it('only for customers without a strong method', () => {
    expect(upsellFor('c1', { passkeys: 0, totp: false }, cfg, {})).toEqual({ label: cfg.c1.label, href: cfg.c1.href });
    expect(upsellFor('c1', { passkeys: 1, totp: false }, cfg, {})).toBeNull();
    expect(upsellFor('c1', { passkeys: 0, totp: true }, cfg, {})).toBeNull();
    expect(upsellFor('c1', { passkeys: 0, totp: false }, cfg, { c1: true })).toBeNull();
    expect(upsellFor('c2', { passkeys: 0, totp: false }, cfg, {})).toBeNull();
  });
  it('rejects unsafe config', () => {
    expect(upsellFor('c1', { passkeys: 0, totp: false }, { c1: { label: 'x', href: 'javascript:alert(1)' } }, {})).toBeNull();
    expect(upsellFor('c1', { passkeys: 0, totp: false }, { c1: { label: '<b>hi</b>', href: 'https://e.com' } }, {})).toBeNull();
  });
});
