import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { applyAccessibilityPreferencesToElement } from '@/lib/a11y/apply-preferences';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from '@/lib/a11y/types';

type AxeWindow = Window & typeof globalThis & { axe: typeof axe };

function injectAxeIntoWindow(window: Window & typeof globalThis): typeof axe {
  const bootstrapAxe = new Function('window', 'document', axe.source) as (
    w: Window & typeof globalThis,
    d: Document,
  ) => void;
  bootstrapAxe(window, window.document);

  const axeInstance = (window as AxeWindow).axe;
  if (!axeInstance?.run) {
    throw new Error('axe-core failed to initialize in JSDOM');
  }
  return axeInstance;
}

async function runAxe(html: string) {
  const dom = new JSDOM(html, { url: 'https://nurawell.test/' });
  const axeInstance = injectAxeIntoWindow(dom.window as unknown as Window & typeof globalThis);

  return axeInstance.run(dom.window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
  });
}

describe('axe smoke — HTML fixtures', () => {
  it('skip link + main landmark has no serious violations', async () => {
    const results = await runAxe(`
      <!DOCTYPE html><html lang="he" dir="rtl"><head><title>בית</title></head><body>
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
