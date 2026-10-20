import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { __resetKmsEnvelope, __setKmsRunner, ensureKmsKeysSync, kmsEnvelopeStatus, wrapKeysSync, fingerprint } from '@/lib/security/kms-envelope';

// Fake KMS: "ciphertext" = reversed base64 tagged with name (AAD binding).
const fakeRunner = (op: 'encrypt' | 'decrypt', _o: string, _c: unknown, items: { name: string; data: string }[]) => {
  const out: Record<string, string> = {};
  for (const it of items) {
    if (op === 'encrypt') out[it.name] = Buffer.from(`${it.name}|${it.data}`).toString('base64');
    else {
      const [n, d] = Buffer.from(it.data, 'base64').toString().split('|');
      if (n !== it.name) throw new Error('kms_decrypt_400');
      out[it.name] = d;
    }
  }
  return out;
};
const wrapOf = (name: string, plain: string) => Buffer.from(`${name}|${Buffer.from(plain).toString('base64')}`).toString('base64');

let env: NodeJS.ProcessEnv;
const PII = randomBytes(32).toString('base64');
beforeEach(() => { __resetKmsEnvelope(); __setKmsRunner(fakeRunner); env = { VERCEL_OIDC_TOKEN: 'x.e30.y' }; });
afterEach(() => __setKmsRunner(null));

describe('kms envelope', () => {
  it('off mode does nothing', () => {
    env.PII_ENCRYPTION_KEY = PII;
    env.KMS_WRAPPED_PII_ENCRYPTION_KEY = 'garbage';
    ensureKmsKeysSync(env);
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
    expect(kmsEnvelopeStatus().state).toBe('idle');
  });

  it('verify mode compares but keeps plain', () => {
    Object.assign(env, { KMS_ENVELOPE_MODE: 'verify', PII_ENCRYPTION_KEY: PII, KMS_WRAPPED_PII_ENCRYPTION_KEY: wrapOf('PII_ENCRYPTION_KEY', PII) });
    ensureKmsKeysSync(env);
    const k = kmsEnvelopeStatus().keys.find((x) => x.name === 'PII_ENCRYPTION_KEY')!;
    expect(k.match).toBe(true);
    expect(k.source).toBe('plain');
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
  });

  it('enforce mode with only wrapped ciphertext sets the key in memory', () => {
    Object.assign(env, { KMS_ENVELOPE_MODE: 'enforce', KMS_WRAPPED_PII_ENCRYPTION_KEY: wrapOf('PII_ENCRYPTION_KEY', PII) });
    ensureKmsKeysSync(env);
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
    expect(kmsEnvelopeStatus().state).toBe('ok');
  });

  it('ciphertext swapped between key names is rejected (AAD) and falls back to plain', () => {
    Object.assign(env, { KMS_ENVELOPE_MODE: 'enforce', PII_ENCRYPTION_KEY: PII, KMS_WRAPPED_PII_ENCRYPTION_KEY: wrapOf('SECURE_VAULT_KEY', 'other') });
    ensureKmsKeysSync(env);
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
    expect(kmsEnvelopeStatus().state).toBe('fallback');
  });

  it('enforce without plain fallback throws when KMS is down', () => {
    __setKmsRunner(() => { throw new Error('kms_decrypt_503'); });
    Object.assign(env, { KMS_ENVELOPE_MODE: 'enforce', KMS_WRAPPED_PII_ENCRYPTION_KEY: 'x' });
    expect(() => ensureKmsKeysSync(env)).toThrow('kms_keys_unavailable');
  });

  it('no OIDC token -> fallback to plain, never throws', () => {
    delete env.VERCEL_OIDC_TOKEN;
    const saved = process.env.VERCEL_OIDC_TOKEN; delete process.env.VERCEL_OIDC_TOKEN;
    Object.assign(env, { KMS_ENVELOPE_MODE: 'enforce', PII_ENCRYPTION_KEY: PII, KMS_WRAPPED_PII_ENCRYPTION_KEY: 'x' });
    ensureKmsKeysSync(env);
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
    expect(kmsEnvelopeStatus().error).toBe('no_oidc_token');
    if (saved) process.env.VERCEL_OIDC_TOKEN = saved;
  });

  it('wrap returns ciphertext + matching fingerprint, never plain', () => {
    env.PII_ENCRYPTION_KEY = PII;
    const saved = process.env.VERCEL_OIDC_TOKEN; process.env.VERCEL_OIDC_TOKEN = 'x.e30.y';
    const out = wrapKeysSync(['PII_ENCRYPTION_KEY'], env);
    expect(out[0].roundTrip).toBe(true);
    expect(out[0].fingerprint).toBe(fingerprint(PII));
    expect(JSON.stringify(out)).not.toContain(PII);
    if (saved) process.env.VERCEL_OIDC_TOKEN = saved; else delete process.env.VERCEL_OIDC_TOKEN;
  });

  it('real worker runner fails closed fast on bad token (no network secrets)', () => {
    __setKmsRunner(null);
    Object.assign(env, { KMS_ENVELOPE_MODE: 'verify', PII_ENCRYPTION_KEY: PII, KMS_WRAPPED_PII_ENCRYPTION_KEY: 'x', VERCEL_OIDC_TOKEN: 'bad.e30.bad' });
    ensureKmsKeysSync(env);
    expect(env.PII_ENCRYPTION_KEY).toBe(PII);
    expect(kmsEnvelopeStatus().error).toMatch(/sts_|fetch|kms_timeout/);
  }, 15_000);
});
