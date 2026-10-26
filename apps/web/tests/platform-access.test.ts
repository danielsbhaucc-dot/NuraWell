import { describe, expect, it } from 'vitest';
import {
  validateJustification, grantExpiry, grantCovers, PII_GRANT_MAX_TTL_MS, checkEnrollment, wellFormedToken, isEnrollCommand,
  matchOptions, enrollStage, mayRegisterPasskey, MATCH_TTL_MS, REGISTER_AFTER_APPROVAL_MS, prefilter, toModelPayload, type EnrollState,
} from '@platform/access';
import { exemptFromDeviceGate, enrollOnly, adminHostOnly } from '@/lib/ops/enroll-gate';

const now = Date.parse('2026-10-25T10:00:00Z');
describe('PII justification', () => {
  it('rejects short, vague and repeated reasons; validates ticket', () => {
    expect(validateJustification('short')).toMatchObject({ ok: false, error: 'reason_too_short' });
    expect(validateJustification('aaaaaaaaaaaaaaaaaaaa')).toMatchObject({ ok: false, error: 'reason_vague' });
    expect(validateJustification('x'.repeat(501))).toMatchObject({ ok: false });
    expect(validateJustification('בדיקת תלונה של המשתמשת על חיוב כפול', 'bad ticket!')).toMatchObject({ ok: false, error: 'ticket_invalid' });
    expect(validateJustification('בדיקת תלונה של המשתמשת על חיוב כפול', 'SUP-123')).toMatchObject({ ok: true, ticketRef: 'SUP-123' });
  });
  it('grant is 30 minutes, capped at 60', () => {
    expect(grantExpiry(now) - now).toBe(30 * 60_000);
    expect(grantExpiry(now, 10 * 3600_000) - now).toBe(PII_GRANT_MAX_TTL_MS);
  });
  it('covers exactly one product/actor/subject until expiry or revoke', () => {
    const g = { id: 'g', productId: 'p', actorId: 'a', subjectId: 's', reason: 'r', ticketRef: null, createdAt: now, expiresAt: now + 1000, revokedAt: null };
    const q = { productId: 'p', actorId: 'a', subjectId: 's' };
    expect(grantCovers(g, q, now)).toBe(true);
    expect(grantCovers(g, { ...q, subjectId: 'other' }, now)).toBe(false);
    expect(grantCovers(g, { ...q, actorId: 'other' }, now)).toBe(false);
    expect(grantCovers(g, { ...q, productId: 'other' }, now)).toBe(false);
    expect(grantCovers(g, q, now + 1000)).toBe(false);
    expect(grantCovers({ ...g, revokedAt: now }, q, now)).toBe(false);
    expect(grantCovers(null, q, now)).toBe(false);
  });
});

describe('enrollment link', () => {
  const row = { id: 'e', tokenHash: 'h', expiresAt: now + 1000, usedAt: null, revokedAt: null };
  it('single use, expiry, revoke, well-formed only', () => {
    expect(checkEnrollment(row, now)).toEqual({ ok: true });
    expect(checkEnrollment({ ...row, usedAt: now }, now)).toMatchObject({ ok: false, reason: 'used' });
    expect(checkEnrollment(row, now + 1000)).toMatchObject({ ok: false, reason: 'expired' });
    expect(checkEnrollment({ ...row, revokedAt: now }, now)).toMatchObject({ ok: false, reason: 'revoked' });
    expect(checkEnrollment(null, now)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(wellFormedToken('a'.repeat(43))).toBe(true);
    expect(wellFormedToken('a'.repeat(42))).toBe(false);
    expect(wellFormedToken('../' + 'a'.repeat(40))).toBe(false);
  });
  it('commands', () => {
    expect(isEnrollCommand('/newdevice')).toBe(true);
    expect(isEnrollCommand('מכשיר חדש')).toBe(true);
    expect(isEnrollCommand('מה קורה')).toBe(false);
  });
});

describe('number matching', () => {
  it('3 distinct 2-digit options including the right one', () => {
    for (let i = 0; i < 200; i++) {
      const n = 10 + (i % 90);
      const o = matchOptions(n);
      expect(o).toHaveLength(3); expect(new Set(o).size).toBe(3); expect(o).toContain(n);
      for (const x of o) { expect(x).toBeGreaterThanOrEqual(10); expect(x).toBeLessThanOrEqual(99); }
    }
    expect(() => matchOptions(5)).toThrow();
  });
  const base: EnrollState = { usedAt: now, revokedAt: null, expiresAt: now + 600_000, factorOkAt: null, matchResult: null, matchExpiresAt: null, matchDecidedAt: null, completedAt: null };
  it('passkey only after approval: link alone / factor alone / wrong / expired never register', () => {
    expect(enrollStage(base, now)).toBe('opened');
    expect(mayRegisterPasskey(base, now)).toBe(false); // link without second factor
    const f = { ...base, factorOkAt: now, matchExpiresAt: now + MATCH_TTL_MS };
    expect(enrollStage(f, now)).toBe('factor_ok');
    expect(mayRegisterPasskey(f, now)).toBe(false); // no approval yet
    expect(enrollStage(f, now + MATCH_TTL_MS)).toBe('expired'); // expired approval window
    expect(mayRegisterPasskey({ ...f, matchResult: 'wrong', revokedAt: now }, now)).toBe(false);
    const ok = { ...f, matchResult: 'approved' as const, matchDecidedAt: now };
    expect(mayRegisterPasskey(ok, now + 1000)).toBe(true);
    expect(mayRegisterPasskey(ok, now + REGISTER_AFTER_APPROVAL_MS)).toBe(false); // stale approval
    expect(mayRegisterPasskey({ ...ok, completedAt: now }, now)).toBe(false); // approval replay
    expect(enrollStage({ ...base, expiresAt: now - 1 }, now)).toBe('expired');
  });
});

describe('audit prefilter', () => {
  const night = Date.parse('2026-10-25T00:30:00Z'); // 02:30 Asia/Jerusalem
  it('flags odd hours, vague reasons, probe bursts; model payload has no identifiers', () => {
    const f = prefilter([
      { at: night, actorId: '11111111-1111-1111-1111-111111111111', kind: 'pii_grant', subjectId: 's', reason: 'need it', ticketRef: null },
      { at: now, actorId: 'probe', kind: 'probe', count: 500 },
      { at: now, actorId: 'a', kind: 'pii_view', subjectId: 's' },
    ], { countries: new Set(['IL']), devices: new Set() });
    expect(f.map((x) => x.signals)).toEqual([['odd_hours', 'vague_reason', 'no_ticket'], ['probe_burst']]);
    const p = toModelPayload(f);
    expect(p).not.toMatch(/1111|need it/);
    expect(() => toModelPayload([{ ...f[0], ref: 'a@b.c' }])).toThrow();
    expect(() => toModelPayload([{ ...f[0], ref: '10.0.0.1' }])).toThrow();
  });
  it('no events → nothing flagged', () => { expect(prefilter([], { countries: new Set(), devices: new Set() })).toEqual([]); });
});

describe('hidden admin gate', () => {
  it('flags default off; only enrollment/api/assets/gideon exempt', () => {
    expect(enrollOnly({} as NodeJS.ProcessEnv)).toBe(false);
    expect(enrollOnly({ OPS_ENROLL_ONLY: 'on' } as NodeJS.ProcessEnv)).toBe(true);
    expect(adminHostOnly({} as NodeJS.ProcessEnv)).toBe(false);
    for (const p of ['/k/abc', '/api/v1/ops/enroll', '/_next/static/x.js', '/__nf', '/gideon/stepup']) expect(exemptFromDeviceGate(p)).toBe(true);
    for (const p of ['/', '/ops', '/users', '/login', '/device-check', '/kx', '/ops/k/abc']) expect(exemptFromDeviceGate(p)).toBe(false);
  });
});
