import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper without types
import { findMintSurfaces, isTintedLight } from '../../scripts/design/mint-surface.mjs';

describe('mint/sage/cream surface detector', () => {
  it('flags mint, sage and cream light surfaces', () => {
    expect(isTintedLight(207, 233, 220)).toBe('mint'); // #cfe9dc (old SOS card)
    expect(isTintedLight(245, 250, 242)).toBe('mint'); // #f5faf2 old cream token
    expect(isTintedLight(250, 243, 228)).toBe('cream');
    expect(findMintSurfaces('background: linear-gradient(#cfe9dc, #e6f2ea)')).toHaveLength(2);
    expect(findMintSurfaces('bg: rgba(207, 233, 220, 0.9)')).toHaveLength(1);
    expect(findMintSurfaces('--c: oklch(91% 0.042 160);')).toHaveLength(1);
  });
  it('passes neutral palette, dark greens and faint tints', () => {
    for (const c of ['#dedee3', '#f2f2f6', '#e8e8ed', '#cfd0d6', '#1f6b4a', '#0b1412', 'rgba(207,233,220,0.1)'])
      expect(findMintSurfaces(c)).toEqual([]);
  });
});
