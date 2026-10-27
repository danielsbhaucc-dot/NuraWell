import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Files touched by the step-up / license-banner / menus work. Must look native to the NuraWell panel. */
const FILES = ['components/admin/StepUpDialog.tsx', 'components/admin/useStepUpRetry.tsx', 'app/ops/layout.tsx'];
const root = join(__dirname, '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');

function hexChannels(h: string): number[] {
  const x = h.length === 4 ? h.slice(1).split('').map((c) => c + c) : [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)];
  return x.map((v) => parseInt(v, 16));
}
/** All literal values assigned to --color-<name> anywhere in globals.css (light + dark). */
function tokenValues(name: string): string[] {
  const re = new RegExp(`--color-${name.replace(/[-/]/g, (m) => '\\' + m)}:\\s*([^;]+);`, 'g');
  return [...css.matchAll(re)].map((m) => m[1].trim());
}
function nearWhite(v: string): boolean {
  if (/^(white|#fff\b|#ffffff)/i.test(v)) return true;
  const h = v.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
  if (h) return hexChannels(h[0]).some((c) => c >= 248);
  const r = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (r) return r.slice(1, 4).map(Number).some((c) => c >= 248);
  return false;
}

/** The AdminShell license banner (only that element). */
const shell = readFileSync(join(root, 'components/admin/AdminShell.tsx'), 'utf8');
const banner = shell.split('\n').find((l) => l.includes('data-testid="license-notice"')) ?? '';

const sources = [...FILES.map((f) => [f, readFileSync(join(root, f), 'utf8')] as const), ['AdminShell license banner', banner] as const];

describe('#413 surfaces: no near-white, Hebrew-capable fonts', () => {
  it('banner exists', () => expect(banner).toContain('license-notice'));
  for (const [f, src] of sources) {
    it(`${f}: no literal white / near-white colours`, () => {
      expect(src).not.toMatch(/\b(bg|text|border|from|to|via)-white\b/);
      for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)) expect(nearWhite(m[0]), `${f}: ${m[0]}`).toBe(false);
    });
    it(`${f}: background/border tokens never resolve near-white in any theme`, () => {
      const used = new Set([...src.matchAll(/\b(?:bg|border)-([a-z]+(?:-[a-z]+)*(?:-\d{2,3})?)(?:\/\d+)?\b/g)].map((m) => m[1]));
      for (const t of used) for (const v of tokenValues(t)) expect(nearWhite(v), `${f}: ${t} = ${v}`).toBe(false);
    });
    it(`${f}: no arbitrary font families (must use Hebrew next/font stacks)`, () => {
      expect(src).not.toMatch(/font-\[(?!family-name:var\(--font-)/);
      expect(src).not.toMatch(/fontFamily\s*:/);
    });
  }
  it('font stacks used are Hebrew-capable', () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-heebo\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-rubik\)/);
  });
});
