import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../app/(auth)/login/page.tsx'), 'utf8');

describe('login buttons: accessible names (WCAG 4.1.2, 2.5.3 label-in-name)', () => {
  it('submit keeps a name while loading (spinner alone is nameless)', () => {
    const at = src.indexOf('data-testid="login-submit"');
    const btn = src.slice(at - 200, src.indexOf('</button>', at));
    expect(btn).toMatch(/aria-busy=\{isLoading\}/);
    expect(btn).toMatch(/<span className="sr-only">מתבצעת כניסה לחשבון<\/span>/);
    expect(btn).toMatch(/animate-spin" aria-hidden/);
  });
  it('aria-label starts with the visible text of the button', () => {
    for (const [label, visible] of [['Face ID או טביעת אצבע לכניסה', 'Face ID או טביעת אצבע'], ['סריקת קוד מהטלפון לכניסה', 'סריקת קוד מהטלפון']]) {
      expect(src).toContain(`aria-label="${label}"`);
      expect(src).toContain(`>${visible}</span>`);
      expect(label.startsWith(visible)).toBe(true);
    }
  });
});
