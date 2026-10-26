import { describe, expect, it } from 'vitest';
import vectors from '../../../packages/@platform/security-crypto/tests/fixtures/enc-v2-vectors.json';
import * as pkg from '@platform/security-crypto';
import * as legacyPath from '@/lib/security/field-envelope';

const kek = Buffer.alloc(32, 7);
const kek2 = Buffer.alloc(32, 9);
const idx = Buffer.alloc(32, 3);

// Vectors were produced by the ORIGINAL apps/web/lib/security/field-envelope.ts before the move.
describe('@platform/security-crypto — frozen enc:v2 format', () => {
  it('old import path re-exports the package (no behavior fork)', () => {
    expect(legacyPath.encryptField).toBe(pkg.encryptField);
    expect(legacyPath.FIELD_PREFIX).toBe('enc:v2:');
  });
  it('AAD / scope strings are byte-identical', () => {
    expect(pkg.fieldAad('profiles', 'notes', 'row-1')).toBe(vectors.aad);
    expect(pkg.dekScope('user-a')).toBe(vectors.scope);
  });
  it('unwraps a DEK and decrypts a field sealed by the original code', () => {
    const dek = pkg.unwrapDataKey(kek, vectors.wrapped as pkg.WrappedDek, 'user-a');
    expect(dek.toString('base64')).toBe(vectors.dek);
    expect(pkg.decryptField(dek, vectors.ct, vectors.aad)).toBe(vectors.plain);
  });
  it('rewrapped DEK (rotation) from the original code still opens', () => {
    const dek = pkg.unwrapDataKey(kek2, vectors.rewrapped as pkg.WrappedDek, 'user-a');
    expect(dek.toString('base64')).toBe(vectors.dek);
  });
  it('blind index is deterministic and identical', () => {
    expect(pkg.blindIndex(idx, 'email', '  Foo@Example.COM ')).toBe(vectors.bi);
  });
  it('fails closed on wrong AAD, wrong user, tampering and non-v2 input', () => {
    const dek = Buffer.from(vectors.dek, 'base64');
    expect(() => pkg.decryptField(dek, vectors.ct, 'nurawell:field:profiles:notes:row-2')).toThrow();
    expect(() => pkg.unwrapDataKey(kek, vectors.wrapped as pkg.WrappedDek, 'user-b')).toThrow();
    const t = vectors.ct.slice(0, -4) + (vectors.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => pkg.decryptField(dek, t, vectors.aad)).toThrow();
    expect(() => pkg.decryptField(dek, 'plain text', vectors.aad)).toThrow();
  });
  it('fresh round-trip + idempotent migrateValue', () => {
    const { dek } = pkg.newDataKey(kek, 1, 'u');
    const aad = pkg.fieldAad('t', 'c', 'r');
    const v = pkg.encryptField(dek, 'x', aad);
    expect(pkg.decryptField(dek, v, aad)).toBe('x');
    expect(pkg.migrateValue(v, { dek, aad, decryptLegacy: () => '' })).toEqual({ value: v, changed: false });
    const m = pkg.migrateValue('plain', { dek, aad, decryptLegacy: () => '' });
    expect(m.changed).toBe(true);
    expect(pkg.decryptField(dek, m.value!, aad)).toBe('plain');
  });
});

import { ENCRYPTED_TABLES } from '@/lib/security/field-registry';

describe('conformance: no-plaintext-in-sensitive-columns', () => {
  const tables = Object.entries(ENCRYPTED_TABLES as Record<string, { columns: Record<string, unknown> }>);
  it('registry is non-empty and every identifier is SQL-safe', () => {
    expect(tables.length).toBeGreaterThan(0);
    for (const [t, spec] of tables) for (const c of Object.keys(spec.columns)) expect(() => pkg.plaintextCountSql(t, c)).not.toThrow();
  });
  it('flags plaintext in every registered column and accepts sealed / empty values', () => {
    for (const [t, spec] of tables) {
      const cols = Object.keys(spec.columns);
      const plain = Object.fromEntries(cols.map((c) => [c, 'secret']));
      const sealed = Object.fromEntries(cols.map((c) => [c, vectors.ct]));
      expect(pkg.findPlaintext(t, cols, [plain]).map((f) => f.column).sort()).toEqual([...cols].sort());
      expect(pkg.findPlaintext(t, cols, [sealed, { }, Object.fromEntries(cols.map((c) => [c, '']))])).toEqual([]);
    }
  });
  it('isSealedValue mirrors enc_value_ok semantics', () => {
    expect(pkg.isSealedValue(null)).toBe(true);
    expect(pkg.isSealedValue('enc:v1:x')).toBe(true);
    expect(pkg.isSealedValue(['enc:v2:a', ''])).toBe(true);
    expect(pkg.isSealedValue(['enc:v2:a', 'x'])).toBe(false);
    expect(pkg.isSealedValue({})).toBe(true);
    expect(pkg.isSealedValue({ a: 1 })).toBe(false);
    expect(pkg.isSealedValue(42)).toBe(false);
  });
  it('rejects unsafe identifiers', () => {
    expect(() => pkg.plaintextCountSql('x; drop table y', 'c')).toThrow();
  });
});
