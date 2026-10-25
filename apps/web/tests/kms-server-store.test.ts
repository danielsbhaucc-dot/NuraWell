import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';

vi.mock('server-only', () => ({}));
const auditCalls: { event: string; detail: Record<string, unknown> }[] = [];
vi.mock('@/lib/auth/passkeys', () => ({ audit: async (_db: unknown, _u: unknown, event: string, detail: Record<string, unknown>) => { auditCalls.push({ event, detail }); } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/ops/device-notify', () => ({ alertOwnerSecurity: vi.fn(async () => undefined) }));
let stepUp = false;
vi.mock('@/lib/ops/sensitive-stepup', () => ({ hasSensitiveStepUp: async () => stepUp }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: async () => ({ ok: true }), rateLimitResponse: () => new Response('rl', { status: 429 }) }));
vi.mock('@/lib/api/require-ops-api-admin', () => ({
  requireOpsApiAdmin: async () => ({ ok: true, user: { id: '00000000-0000-0000-0000-000000000001' }, supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }),
}));

import { __setJwksFetcher, verifyGoogleIdToken } from '@/lib/security/google-id-token';
import { __resetKmsEnvelope, __setKmsRunner } from '@/lib/security/kms-envelope';
import { KMS_INTERNAL_AUDIENCE, kmsRotatorEmail } from '@/lib/security/kms-rotation';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims: Record<string, unknown>, key = privateKey, kid = 'k1') {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', kid }); const p = b64({ iss: 'https://accounts.google.com', aud: KMS_INTERNAL_AUDIENCE, email: kmsRotatorEmail(), email_verified: true, iat: now, exp: now + 3600, ...claims });
  const s = createSign('RSA-SHA256'); s.update(`${h}.${p}`);
  return `${h}.${p}.${s.sign(key).toString('base64url')}`;
}
const opts = { audience: KMS_INTERNAL_AUDIENCE, allowedEmails: [kmsRotatorEmail()] };

beforeEach(() => { __setJwksFetcher(async () => [jwk]); auditCalls.length = 0; stepUp = false; __resetKmsEnvelope(); });
afterEach(() => { __setJwksFetcher(null); __setKmsRunner(null); });

describe('google id token verifier', () => {
  it('accepts the rotator service account', async () => { expect(await verifyGoogleIdToken(sign({}), opts)).toEqual({ email: kmsRotatorEmail() }); });
  it.each([
    ['wrong audience', { aud: 'https://evil' }],
    ['wrong email', { email: 'attacker@gmail.com' }],
    ['unverified email', { email_verified: false }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 600, iat: Math.floor(Date.now() / 1000) - 4000 }],
    ['wrong issuer', { iss: 'https://evil.example' }],
  ])('rejects %s', async (_n, c) => { expect(await verifyGoogleIdToken(sign(c), opts)).toBeNull(); });
  it('rejects a forged signature / unknown kid / garbage / alg none', async () => {
    expect(await verifyGoogleIdToken(sign({}, other), opts)).toBeNull();
    expect(await verifyGoogleIdToken(sign({}, privateKey, 'nope'), opts)).toBeNull();
    expect(await verifyGoogleIdToken('a.b.c', opts)).toBeNull();
    expect(await verifyGoogleIdToken(`${b64({ alg: 'none', kid: 'k1' })}.${b64({ aud: KMS_INTERNAL_AUDIENCE })}.`, opts)).toBeNull();
    expect(await verifyGoogleIdToken(null, opts)).toBeNull();
  });
});

describe('internal kms route', () => {
  const call = async (token: string | null, body: unknown) => {
    const { POST } = await import('@/app/api/v1/internal/kms/route');
    return POST(new Request('https://nurawell.vercel.app/api/v1/internal/kms', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
  };
  it('401 without a token, with a user-session-like token, or with another SA', async () => {
    expect((await call(null, { action: 'wrap' })).status).toBe(401);
    expect((await call('x.y.z', { action: 'wrap' })).status).toBe(401);
    expect((await call(sign({ email: 'vercel-kms@nurawell-kms-2610.iam.gserviceaccount.com' }), { action: 'wrap' })).status).toBe(401);
    expect(auditCalls.find((a) => a.event === 'kms_keys_wrapped')).toBeUndefined();
  });
  it('status never contains key values and is audited', async () => {
    const res = await call(sign({}), { action: 'status' });
    expect(res.status).toBe(200);
    expect(auditCalls.some((a) => a.event === 'kms_internal_status')).toBe(true);
  });
  it('wrap returns ciphertext only to the rotator, never plain, and audits fingerprints only', async () => {
    const secret = 'super-secret-plain-value-123';
    for (const n of ['PII_ENCRYPTION_KEY', 'SECURE_VAULT_KEY', 'CONSENT_SIGNING_PRIVATE_KEY', 'LEGAL_LOGS_VERCEL_TOKEN', 'LEGAL_LOGS_SUPABASE_TOKEN']) vi.stubEnv(n, secret + n);
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'x.e30.y');
    __setKmsRunner((op, _o, _c, items) => Object.fromEntries(items.map((i) => [i.name, op === 'encrypt' ? Buffer.from('CT' + i.data).toString('base64') : Buffer.from(Buffer.from(i.data, 'base64').toString().slice(2)).toString()])));
    const res = await call(sign({}), { action: 'wrap' });
    const txt = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(txt).ok).toBe(true);
    expect(txt).not.toContain(secret);
    expect(JSON.stringify(auditCalls)).not.toContain(secret);
    expect(JSON.stringify(auditCalls)).not.toContain('ciphertext');
    vi.unstubAllEnvs();
  });
  it('failure report alerts the owner', async () => {
    const dn = await import('@/lib/ops/device-notify');
    await call(sign({}), { action: 'report', ok: false, summary: 'verify_failed' });
    expect(dn.alertOwnerSecurity).toHaveBeenCalled();
    expect(auditCalls.some((a) => a.event === 'kms_rotation_failed')).toBe(true);
  });
});

describe('admin wrap button route', () => {
  it('enforces step-up and never returns ciphertext', async () => {
    const { POST } = await import('@/app/api/v1/admin/kms-wrap/route');
    const r1 = await POST(new Request('https://ops.example/api/v1/admin/kms-wrap', { method: 'POST' }));
    expect(r1.status).toBe(403);
    expect(auditCalls.some((a) => a.event === 'kms_wrap_stepup_required')).toBe(true);
    stepUp = true;
    vi.stubEnv('KMS_ROTATOR_URL', '');
    const r2 = await POST(new Request('https://ops.example/api/v1/admin/kms-wrap', { method: 'POST' }));
    const t2 = await r2.text();
    expect(r2.status).toBe(503);
    expect(t2).not.toMatch(/ciphertext|wrapped/);
    vi.unstubAllEnvs();
  });
});
