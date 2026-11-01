import { describe, it, expect } from 'vitest';
import * as nw from '@platform/security-crypto';
import * as kit from '@core/security-privacy/crypto';

// Frozen vectors produced by NuraWell's production implementation (test keys only: KEK=0x07×32, index key=0x09×32).
const KEK = Buffer.alloc(32, 7);
const WRAPPED = { v: 1 as const, kek: 'FIELD_KEK' as const, kekv: 1, wdek: 'lx3FYtkmEcExnEU8URxurWkIYKm2hq+Ql7LAU16UKaC4dlKPEzHNOP/uGqMf0nzz0j0sGCCud2Xmu3Ci', aad: 'nurawell:dek:user:user-1' };
const DEK_HEX = '5b041bd415389f281bfaf0ae9bbcc0085dc5da8d50303d427f929d8ee7faaad6';
const FIELD = 'enc:v2:AsW/watf+qItDvYIUW/rglIaYNn9qdiS+0qdn9JJhmv6GbRbbAdYIg==';

describe('security-privacy kit crypto is byte-compatible with NuraWell enc:v2 (zero data movement)', () => {
  it('kit opens NuraWell-sealed DEK, field and blind index vectors', () => {
    kit.setCryptoNamespace('nurawell');
    const dek = kit.unwrapDataKey(KEK, WRAPPED, 'user-1');
    expect(dek.toString('hex')).toBe(DEK_HEX);
    expect(kit.decryptField(dek, FIELD, kit.fieldAad('profiles', 'phone', 'row-1'))).toBe('שלום 123');
    expect(kit.blindIndex(Buffer.alloc(32, 9), 'phone', '0501234567')).toBe('X4ex6Rl6Z-y0iwPzrzjxMQ');
    expect(kit.dekScope('u')).toBe(nw.dekScope('u'));
    expect(kit.fieldAad('a', 'b', 'c')).toBe(nw.fieldAad('a', 'b', 'c'));
  });
  it('NuraWell opens kit-sealed values (both directions)', () => {
    kit.setCryptoNamespace('nurawell');
    const { dek, wrapped } = kit.newDataKey(KEK, 2, 'user-2');
    expect(nw.unwrapDataKey(KEK, wrapped, 'user-2').equals(dek)).toBe(true);
    const v = kit.encryptField(dek, 'x@y.z', kit.fieldAad('t', 'c', 'r'));
    expect(nw.decryptField(dek, v, nw.fieldAad('t', 'c', 'r'))).toBe('x@y.z');
    expect(() => nw.decryptField(dek, v, nw.fieldAad('t', 'c', 'other'))).toThrow();
  });
});
