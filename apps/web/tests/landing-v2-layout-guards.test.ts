import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Static guards for /landing-v2. The geometric twin (bounding boxes at 8 widths x 2 motion modes)
// lives in scripts/landing-v2-layout-check.mjs and needs a real browser.
const src = readFileSync(join(__dirname, '../app/landing-v2/landing-html.ts'), 'utf8');
const lines = JSON.parse(readFileSync(join(__dirname, '../public/landing-v2/real/almog-lines.json'), 'utf8')) as { buckets: Record<string, string[]> };
const pool = Object.values(lines.buckets).flat();

describe('landing-v2 layout guards', () => {
  it('big-idea card icon is normal-flow (static) on desktop, after any absolute rule', () => {
    expect(src).toMatch(/@media \(min-width:821px\)\{\.cc svg\{position:static!important;display:block/);
  });
  it('accent period is kept with its word in a nowrap span (never a punctuation-only line)', () => {
    expect(src).toMatch(/h1 \.nw,h2 \.nw\{[^}]*white-space:nowrap/);
    expect(src).toContain("className='nw'");
    // no heading ends with a space before the period
    expect(src).not.toMatch(/\s\.<\/h[1-3]>/);
  });
  it('Hebrew display font has a Hebrew subset and is preloaded', () => {
    expect(src).toContain('/landing-v2/fonts/secular-he.woff2');
    expect(src).toMatch(/rel=\\?"preload\\?" href=\\?"\/landing-v2\/fonts\/secular-he\.woff2/);
    expect(src).not.toContain('Fredoka');
  });
});

describe('landing-v2 Hebrew copy', () => {
  const all = src + '\n' + pool.join('\n');
  it('uses feminine agreement for דיאטה', () => expect(all).not.toContain('זה לא דיאטה'));
  it('has no slash-gender forms', () => expect(all).not.toMatch(/[\u05d0-\u05ea]\/(ה|ת|ים|ות)(?![\u05d0-\u05ea])/));
  it('spells הכול in full', () => expect(all).not.toMatch(/(?<![\u05d0-\u05ea])[ובלמה]?הכל(?![\u05d0-\u05ea])/));
});

describe('landing-v2 big-idea cards', () => {
  it('cards size to content and the carousel height follows the tallest card', () => {
    expect(src).toMatch(/\.nd \.cc\{height:auto!important/);
    expect(src).toMatch(/\.nd \.carou\{height:var\(--ch/);
    expect(src).toContain("c.style.setProperty('--ch'");
  });
});

describe('landing-v2 links', () => {
  it('has no placeholder # links and points CTAs to real routes', () => {
    expect(src).not.toMatch(/href=\\"#\\"/);
    for (const r of ['/register', '/login', '/terms', '/privacy', '/safety', '/accessibility']) expect(src).toContain(`href=\\"${r}\\"`);
  });
  it('uses one shared reading-time config for timed sequences', () => {
    expect(src).toContain('window.NW_TIMING={perWord:250,min:2500');
  });
});
