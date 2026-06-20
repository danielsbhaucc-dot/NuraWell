/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { applyAccessibilityPreferencesToElement } from '@/lib/a11y/apply-preferences';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from '@/lib/a11y/types';

function runAxe(html: string) {
  const dom = new JSDOM(html);
  const { window } = dom;
  const document = window.document;
  (globalThis as typeof globalThis & { window: Window }).window = window as unknown as Window;
  (globalThis as typeof globalThis & { document: Document }).document = document;

  return new Promise<axe.AxeResults>((resolve, reject) => {
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } }, (err, results) => {
      if (err) reject(err);
      else resolve(results!);
    });
  });
}

describe('axe smoke — HTML fixtures', () => {
  it('skip link + main landmark has no serious violations', async () => {
    const results = await runAxe(`
      <!DOCTYPE html><html lang="he" dir="rtl"><body>
        <a href="#main-content">דלג לתוכן</a>
        <main id="main-content" tabindex="-1"><h1>בית</h1><p>תוכן</p></main>
      </body></html>
    `);
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious).toEqual([]);
  });

  it('accessibility preference classes apply without throwing', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    applyAccessibilityPreferencesToElement(dom.window.document.documentElement, {
      ...DEFAULT_ACCESSIBILITY_PREFERENCES,
      highContrast: true,
      highlightHeadings: true,
    });
    expect(dom.window.document.documentElement.classList.contains('a11y-high-contrast')).toBe(true);
  });
});
