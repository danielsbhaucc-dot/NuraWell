import { describe, expect, it } from 'vitest';
import { decide } from '../scripts/strip-metadata-full-name';

const dec = async (_t: string, _c: string, _u: string, _r: string, v: unknown) => {
  if (v === 'enc:v2:bad') throw new Error('no data key for user');
  return String(v).replace('enc:v2:', '');
};

describe('strip-metadata-full-name decide', () => {
  it('strips only when the v2 profile copy round-trips', async () => {
    expect(await decide('u', 'Dana  Levi', 'enc:v2:Dana Levi', dec)).toBe('strip');
    expect(await decide('u', 'Dana', 'enc:v2:Other', dec)).toBe('mismatch');
    expect(await decide('u', 'Dana', 'Dana', dec)).toBe('profile_not_v2');
    expect(await decide('u', 'Dana', 'enc:v1:x', dec)).toBe('profile_not_v2');
    expect(await decide('u', 'Dana', 'enc:v2:bad', dec)).toBe('decrypt_failed');
    expect(await decide('u', 'Dana', undefined, dec)).toBe('no_profile');
    expect(await decide('u', '', 'enc:v2:x', dec)).toBe('no_meta_name');
    expect(await decide('u', undefined, 'enc:v2:x', dec)).toBe('no_meta_name');
  });
});
