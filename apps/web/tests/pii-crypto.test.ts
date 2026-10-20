import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetPiiKeyCache,
  decryptDossierRow,
  decryptJson,
  decryptStringArray,
  encryptJson,
  encryptStringArray,
  isEncrypted,
} from '@/lib/crypto/pii';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

describe('pii crypto', () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetPiiKeyCache();
  });

  it('round-trips JSON and stores no plaintext', () => {
    const v = { conditions_mentioned: ['אסתמה'], fatigue: 'גבוהה' };
    const enc = encryptJson(v, U1);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('אסתמה');
    expect(decryptJson(enc, U1)).toEqual(v);
  });

  it('uses a fresh IV every time', () => {
    expect(encryptJson({ a: 1 }, U1)).not.toEqual(encryptJson({ a: 1 }, U1));
  });

  it('binds ciphertext to the user (AAD)', () => {
    const enc = encryptJson({ a: 1 }, U1);
    expect(() => decryptJson(enc, U2)).toThrow();
  });

  it('detects tampering', () => {
    const enc = encryptJson({ a: 1 }, U1) as string;
    const i = Math.floor(enc.length / 2);
    const bad = enc.slice(0, i) + (enc[i] === 'A' ? 'B' : 'A') + enc.slice(i + 1);
    expect(() => decryptJson(bad, U1)).toThrow();
  });

  it('passes legacy plaintext through unchanged', () => {
    expect(decryptJson({ x: 1 }, U1)).toEqual({ x: 1 });
    expect(decryptStringArray(['plain'], U1)).toEqual(['plain']);
    expect(encryptJson(null, U1)).toBeNull();
  });

  it('encrypts string arrays item by item and is idempotent', () => {
    const enc = encryptStringArray(['הפרעת אכילה', 'תרופות'], U1);
    expect(enc.every(isEncrypted)).toBe(true);
    expect(encryptStringArray(enc, U1)).toEqual(enc);
    expect(decryptStringArray(enc, U1)).toEqual(['הפרעת אכילה', 'תרופות']);
  });

  it('decrypts only the sensitive dossier fields', () => {
    const row = { user_id: U1, goals: { g: 1 }, psychology: encryptJson({ p: 1 }, U1), risk_signals: encryptJson({ r: 2 }, U1) };
    expect(decryptDossierRow(row, U1)).toEqual({ user_id: U1, goals: { g: 1 }, psychology: { p: 1 }, risk_signals: { r: 2 } });
  });

  it('fails closed without a key', () => {
    delete process.env.PII_ENCRYPTION_KEY;
    __resetPiiKeyCache();
    expect(() => encryptJson({ a: 1 }, U1)).toThrow('PII_ENCRYPTION_KEY missing');
  });
});
