import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAuth = vi.fn();
const verifyReg = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'chal-login' })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'chal-reg' })),
  verifyAuthenticationResponse: (...a: unknown[]) => verifyAuth(...a),
  verifyRegistrationResponse: (...a: unknown[]) => verifyReg(...a),
}));

import {
  consumeChallenge,
  isFreshSession,
  redeemBackupCode,
  resolveRp,
  verifyAuthentication,
  verifyRegistration,
  newBackupCode,
} from '@/lib/auth/passkeys';

type Q = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][]; rpc?: string; args?: unknown };
type Handler = (q: Q) => { data?: unknown; error?: unknown; count?: number };

function fakeDb(handler: Handler) {
  const log: Q[] = [];
  const chain = (q: Q) => {
    const run = () => {
      log.push(q);
      return Promise.resolve({ data: null, error: null, ...handler(q) });
    };
    const p: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'upsert', 'delete']) {
      p[op] = (payload?: unknown) => {
        if (op !== 'select' || q.op === 'select') q.op = op === 'select' && q.op !== 'select' ? q.op : op;
        if (op !== 'select') q.payload = payload;
        return proxy;
      };
    }
    for (const f of ['eq', 'is', 'gt', 'lt', 'in', 'order', 'limit']) p[f] = (col: string, val: unknown) => (q.filters.push([f, col, val]), proxy);
    p.single = () => proxy;
    p.maybeSingle = () => proxy;
    p.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej);
    const proxy = p;
    return proxy;
  };
  const db = {
    from: (table: string) => chain({ table, op: 'select', filters: [] }),
    rpc: (name: string, args: unknown) => {
      const q: Q = { table: '', op: 'rpc', rpc: name, args, filters: [] };
      log.push(q);
      return Promise.resolve({ data: null, error: null, ...handler(q) });
    },
  };
  return { db: db as never, log };
}

const req = (origin?: string) => new Request('https://nurawell.vercel.app/api/v1/auth/passkey', { method: 'POST', headers: origin ? { origin } : {} });
const prodEnv = { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://nurawell.vercel.app' } as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  verifyAuth.mockReset();
  verifyReg.mockReset();
});

describe('origin / RP allowlist', () => {
  it('rejects a missing or foreign origin', () => {
    expect(resolveRp(req(), prodEnv)).toBeNull();
    expect(resolveRp(req('https://evil.example'), prodEnv)).toBeNull();
    expect(resolveRp(req('https://nurawell.vercel.app.evil.example'), prodEnv)).toBeNull();
    expect(resolveRp(req('http://localhost:3000'), prodEnv)).toBeNull();
  });
  it('accepts the app origin and derives the rpID from it', () => {
    expect(resolveRp(req('https://nurawell.vercel.app'), prodEnv)).toEqual({ origin: 'https://nurawell.vercel.app', rpID: 'nurawell.vercel.app' });
  });
});

describe('server-side challenges', () => {
  it('rejects missing / malformed binding cookies without touching the DB', async () => {
    const { db, log } = fakeDb(() => ({ data: [] }));
    expect(await consumeChallenge(db, null, 'login')).toBeNull();
    expect(await consumeChallenge(db, 'short', 'login')).toBeNull();
    expect(log).toHaveLength(0);
  });
  it('consumes atomically by sha256(cookie), purpose, unconsumed and unexpired', async () => {
    const secret = 'a'.repeat(43);
    const { db, log } = fakeDb(() => ({ data: [] }));
    expect(await consumeChallenge(db, secret, 'login')).toBeNull();
    const q = log[0];
    expect(q.op).toBe('update');
    expect(q.filters).toContainEqual(['eq', 'binding_hash', createHash('sha256').update(secret).digest('hex')]);
    expect(q.filters).toContainEqual(['eq', 'purpose', 'login']);
    expect(q.filters).toContainEqual(['is', 'consumed_at', null]);
    expect(q.filters.some(([f, c]) => f === 'gt' && c === 'expires_at')).toBe(true);
  });
});

const ch = { id: 'c', user_id: null, purpose: 'login' as const, challenge: 'chal', rp_id: 'nurawell.vercel.app', origin: 'https://nurawell.vercel.app' };
const cred = { id: '11111111-1111-1111-1111-111111111111', user_id: 'u1', credential_id: 'cred', public_key: 'AAAA', counter: 5, transports: [], rp_id: 'nurawell.vercel.app', revoked_at: null };

describe('passkey sign-in bypass attempts', () => {
  it('no challenge (expired / replayed) → rejected before verification', async () => {
    const { db } = fakeDb(() => ({ data: cred }));
    expect(await verifyAuthentication(db, null, { id: 'cred' } as never)).toEqual({ ok: false, error: 'expired' });
    expect(verifyAuth).not.toHaveBeenCalled();
  });
  it('unknown, revoked or other-RP credentials are rejected', async () => {
    for (const row of [null, { ...cred, revoked_at: '2026-01-01' }, { ...cred, rp_id: 'evil.example' }]) {
      const { db } = fakeDb(() => ({ data: row }));
      expect((await verifyAuthentication(db, ch, { id: 'cred' } as never)).ok).toBe(false);
    }
    expect(verifyAuth).not.toHaveBeenCalled();
  });
  it('requires user verification and passes stored challenge/origin/rp/counter', async () => {
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 6, userVerified: false } });
    const { db } = fakeDb(() => ({ data: cred }));
    expect((await verifyAuthentication(db, ch, { id: 'cred' } as never)).ok).toBe(false);
    const opts = verifyAuth.mock.calls[0][0];
    expect(opts).toMatchObject({ expectedChallenge: 'chal', expectedOrigin: ch.origin, expectedRPID: ch.rp_id, requireUserVerification: true });
    expect(opts.credential.counter).toBe(5);
  });
  it('a signature / counter failure from the verifier is rejected', async () => {
    verifyAuth.mockRejectedValue(new Error('counter'));
    const { db } = fakeDb(() => ({ data: cred }));
    expect((await verifyAuthentication(db, ch, { id: 'cred' } as never)).ok).toBe(false);
  });
  it('a concurrent replay loses the counter compare-and-swap', async () => {
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 6, userVerified: true } });
    const { db, log } = fakeDb((q) => (q.op === 'update' ? { data: [] } : { data: cred }));
    expect((await verifyAuthentication(db, ch, { id: 'cred' } as never)).ok).toBe(false);
    const upd = log.find((q) => q.table === 'webauthn_credentials' && q.op === 'update')!;
    expect(upd.filters).toContainEqual(['eq', 'counter', 5]);
  });
  it('happy path returns the credential owner', async () => {
    verifyAuth.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 6, userVerified: true } });
    const { db } = fakeDb((q) => (q.op === 'update' ? { data: [{ id: cred.id }] } : { data: cred }));
    expect(await verifyAuthentication(db, ch, { id: 'cred' } as never)).toEqual({ ok: true, userId: 'u1' });
  });
});

describe('passkey registration bypass attempts', () => {
  const rch = { ...ch, purpose: 'register' as const, user_id: 'u1' };
  it("another user's challenge cannot register a key", async () => {
    const { db } = fakeDb(() => ({ data: { id: 'x' } }));
    expect(await verifyRegistration(db, 'u2', rch, {} as never, { label: 'x', opsDeviceId: null })).toEqual({ ok: false, error: 'expired' });
    expect(verifyReg).not.toHaveBeenCalled();
  });
  it('registration without user verification is rejected', async () => {
    verifyReg.mockResolvedValue({ verified: true, registrationInfo: { userVerified: false, credential: { id: 'c', publicKey: new Uint8Array([1]), counter: 0 } } });
    const { db } = fakeDb(() => ({ data: { id: 'x' } }));
    expect((await verifyRegistration(db, 'u1', rch, {} as never, { label: 'x', opsDeviceId: null })).ok).toBe(false);
  });
});

describe('backup codes', () => {
  it('generates 10-char codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(newBackupCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });
  it('a locked account cannot try codes at all', async () => {
    const { db, log } = fakeDb((q) => (q.table === 'user_auth_factor_state' ? { data: { backup_failures: 0, backup_locked_until: new Date(Date.now() + 60_000).toISOString() } } : {}));
    expect(await redeemBackupCode(db, 'u1', 'ABCDE-FGHJK')).toEqual({ ok: false, locked: true });
    expect(log.some((q) => q.rpc)).toBe(false);
  });
  it('malformed codes never reach the DB check and count as failures; the 5th locks', async () => {
    const { db, log } = fakeDb((q) => (q.table === 'user_auth_factor_state' && q.op === 'select' ? { data: { backup_failures: 4, backup_locked_until: null } } : {}));
    expect(await redeemBackupCode(db, 'u1', "' or 1=1 --")).toEqual({ ok: false, locked: true });
    expect(log.some((q) => q.rpc)).toBe(false);
  });
  it('single use is enforced by the DB function (second use fails)', async () => {
    let used = false;
    const { db } = fakeDb((q) => {
      if (q.rpc === 'user_use_backup_code') {
        const hit = !used;
        used = true;
        return { data: hit };
      }
      return { data: null };
    });
    expect(await redeemBackupCode(db, 'u1', 'abcde-fghjk')).toEqual({ ok: true });
    expect((await redeemBackupCode(db, 'u1', 'abcde-fghjk')).ok).toBe(false);
  });
});

describe('step-up freshness (per session amr)', () => {
  const tok = (amr: unknown) => `h.${Buffer.from(JSON.stringify({ amr })).toString('base64url')}.s`;
  const now = Date.parse('2026-10-20T12:00:00Z');
  it('fresh within 15 minutes, stale after, garbage rejected', () => {
    expect(isFreshSession(tok([{ method: 'password', timestamp: now / 1000 - 60 }]), now)).toBe(true);
    expect(isFreshSession(tok([{ method: 'password', timestamp: now / 1000 - 3600 }]), now)).toBe(false);
    expect(isFreshSession(tok([{ method: 'password', timestamp: now / 1000 + 3600 }]), now)).toBe(false);
    expect(isFreshSession('not-a-jwt', now)).toBe(false);
    expect(isFreshSession(null, now)).toBe(false);
  });
});

describe('Ops device approval stays enforced', () => {
  const src = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8');
  it('passkey / backup-code sign-in never creates or approves a trusted Ops device', () => {
    for (const f of ['lib/auth/passkeys.ts', 'lib/auth/issue-session.ts', 'app/api/v1/auth/passkey/route.ts', 'app/api/v1/auth/backup-code/route.ts']) {
      const s = src(f);
      expect(s).not.toMatch(/createTrustedDevice|decideRequest|consumeApproved|DEVICE_COOKIE|ops_trusted_devices|ops_login_requests/);
    }
  });
  it('the device gate does not know about passkeys', () => {
    expect(src('lib/ops/device-gate.ts')).not.toMatch(/passkey|webauthn/i);
  });
  it('admins can add a sign-in method only from an approved device, after a fresh sign-in', () => {
    const s = src('app/api/v1/account/security/route.ts');
    expect(s).toMatch(/if \(!c\.fresh\) return/);
    expect(s).toMatch(/if \(c\.isAdmin && !c\.opsDeviceId\) return/);
    // no bootstrap path from settings
    expect(s).not.toMatch(/opsDeviceGate|allowBootstrap|createTrustedDevice/);
  });
});
