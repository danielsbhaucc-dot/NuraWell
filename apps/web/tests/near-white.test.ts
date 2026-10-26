import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script
import { findNearWhite, nearWhiteAliases } from '../scripts/near-white.mjs';

const hit = (s: string, a: string[] = []) => findNearWhite(s, a).length > 0;
describe('near-white detector', () => {
  it.each(['#fff', '#FFFFFF', '#fefefe', '#fafafaff', 'rgb(255,255,255)', 'rgba(250, 250, 250, 0.9)', 'hsl(120 20% 98%)',
    'oklch(98.4% 0.003 247)', 'oklch(0.985 0 0)', 'bg-white', 'bg-white/90', 'bg-white/60', 'to-white', 'border-white/20',
    'bg-on-dark', "style={{ background: 'white' }}", 'linear-gradient(#000, white)', 'background-color: white'])('flags %s', (s) => {
    expect(hit(s)).toBe(true);
  });
  it.each(['#e7eedc', '#10261c', 'rgba(255,255,255,0.2)', 'bg-white/20', 'bg-on-dark/10', 'text-on-dark', 'text-white',
    'oklch(60% 0.2 150)', 'hsl(120 20% 50%)', '#ffffff33'])('allows %s', (s) => {
    expect(hit(s)).toBe(false);
  });
  it('detects white alias tokens from theme', () => {
    const al = nearWhiteAliases('--color-paper: #fdfdfd; --color-glass: #e7eedc; --color-snow: white;');
    expect(al).toEqual(['paper', 'snow']);
    expect(hit('bg-paper', al)).toBe(true);
    expect(hit('bg-paper/40', al)).toBe(false);
  });
});
