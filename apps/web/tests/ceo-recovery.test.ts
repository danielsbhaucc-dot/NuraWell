import { describe, expect, it } from 'vitest';
import { hashRecovery, matchRecovery } from '@/lib/ceo/recovery';

describe('recovery codes', () => {
  it('salted hash matches only the right code, case/dash-insensitive', () => {
    const h = hashRecovery('ABCD-EFGH-JKLM');
    expect(h).not.toContain('ABCD');
    expect(matchRecovery('abcd efgh jklm', h)).toBe(true);
    expect(matchRecovery('ABCD-EFGH-JKLN', h)).toBe(false);
    expect(hashRecovery('ABCD-EFGH-JKLM')).not.toBe(h);
  });
});
