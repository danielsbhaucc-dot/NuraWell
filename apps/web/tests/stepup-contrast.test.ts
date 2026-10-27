import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
const src = readFileSync(join(__dirname, '../components/admin/StepUpDialog.tsx'), 'utf8');
const hex = (name: string) => {
  const all = [...css.matchAll(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
  expect(all.length, name).toBeGreaterThan(0);
  return all; // every theme's value must pass
};
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('step-up buttons contrast', () => {
  it('primary button is deep forest with on-dark text, ≥4.5:1 in every theme', () => {
    const m = src.match(/STEPUP_PRIMARY_BTN =\s*'([^']+)'/);
    expect(m).toBeTruthy();
    const bg = m![1].match(/(?:^|\s)bg-(forest-\d+)/)![1];
    const fg = m![1].match(/(?:^|\s)text-(on-dark)(?:\s|$)/)![1];
    for (const b of hex(bg)) for (const f of hex(fg)) expect(ratio(b, f)).toBeGreaterThanOrEqual(4.5);
  });
  it('secondary button: forest text on the light dialog surface ≥4.5:1', () => {
    const m = src.match(/STEPUP_SECONDARY_BTN =\s*'([^']+)'/)!;
    const fg = m[1].match(/(?:^|\s)text-(forest-\d+)/)![1];
    for (const f of hex(fg)) for (const b of ['#e8e8ed', '#f2f2f6']) expect(ratio(f, b)).toBeGreaterThanOrEqual(4.5);
  });
  it('no translucent mint primary buttons remain in the step-up dialog', () => {
    expect(src).not.toMatch(/opsGlassBtn(Primary)?Class|bg-primary-500\/1[05]|bg-accent-500\/10/);
    expect(src).not.toMatch(/bg-primary-800 text-accent-50/);
  });
});
