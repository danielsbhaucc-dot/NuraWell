import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  blindIndex, decryptField, encryptField, fieldAad, migrateValue, newDataKey, rewrapDataKey, unwrapDataKey,
} from '@/lib/security/field-envelope';

const kek = randomBytes(32);
const u1 = '11111111-1111-1111-1111-111111111111';
const u2 = '22222222-2222-2222-2222-222222222222';

describe('field envelope (test data only)', () => {
  it('round-trips and binds ciphertext to table/column/row', () => {
    const { dek, wrapped } = newDataKey(kek, 1, u1);
    const aad = fieldAad('user_memory_dossier', 'health_context', 'row-1');
    const ct = encryptField(dek, 'סוכרת סוג 2', aad);
    expect(ct.startsWith('enc:v2:')).toBe(true);
    expect(ct).not.toContain('סוכרת');
    expect(decryptField(unwrapDataKey(kek, wrapped, u1), ct, aad)).toBe('סוכרת סוג 2');
    expect(() => decryptField(dek, ct, fieldAad('user_memory_dossier', 'health_context', 'row-2'))).toThrow();
  });

  it('a DEK cannot be unwrapped for another user or with another KEK', () => {
    const { wrapped } = newDataKey(kek, 1, u1);
    expect(() => unwrapDataKey(kek, wrapped, u2)).toThrow();
    expect(() => unwrapDataKey(randomBytes(32), wrapped, u1)).toThrow();
  });

  it('KEK rotation re-wraps without touching data; crypto-shred = lose the DEK', () => {
    const { dek, wrapped } = newDataKey(kek, 1, u1);
    const aad = fieldAad('notifications', 'body', 'n1');
    const ct = encryptField(dek, 'hello', aad);
    const kek2 = randomBytes(32);
    const w2 = rewrapDataKey(kek, kek2, 2, wrapped, u1);
    expect(w2.kekv).toBe(2);
    expect(decryptField(unwrapDataKey(kek2, w2, u1), ct, aad)).toBe('hello');
    expect(() => decryptField(randomBytes(32), ct, aad)).toThrow();
  });

  it('blind index is deterministic, normalised and keyed', () => {
    const k = randomBytes(32);
    expect(blindIndex(k, 'phone', ' 0501234567 ')).toBe(blindIndex(k, 'phone', '0501234567'));
    expect(blindIndex(k, 'email', 'A@B.com')).toBe(blindIndex(k, 'email', 'a@b.com'));
    expect(blindIndex(k, 'phone', '0501234567')).not.toBe(blindIndex(randomBytes(32), 'phone', '0501234567'));
    expect(blindIndex(k, 'phone', 'x')).not.toBe(blindIndex(k, 'email', 'x'));
  });

  it('migration is idempotent and verifies round-trip', () => {
    const { dek } = newDataKey(kek, 1, u1);
    const aad = fieldAad('profiles', 'ai_context', u1);
    const ctx = { dek, aad, decryptLegacy: (v: string) => v.replace('enc:v1:', '') };
    const a = migrateValue('plain text', ctx);
    expect(a.changed).toBe(true);
    const b = migrateValue(a.value, ctx);
    expect(b.changed).toBe(false);
    expect(migrateValue('enc:v1:legacy', ctx).value && decryptField(dek, migrateValue('enc:v1:legacy', ctx).value!, aad)).toBe('legacy');
    expect(migrateValue(null, ctx).changed).toBe(false);
  });
});
