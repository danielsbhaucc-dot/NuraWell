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
    expect(src).toContain('window.NW_TIMING={perWord:425,min:4200');
  });
});

describe('landing-v2 desktop paint budget and Almog widget placement', () => {
  it('keeps the desktop paint diet (no header backdrop blur, static background blobs, offscreen animation pause)', () => {
    expect(src).toContain('r6 desktop paint diet');
    expect(src).toMatch(/header\.top,\.top\{backdrop-filter:none!important/);
    expect(src).toMatch(/\.bgfx i\{display:none!important\}/);
    expect(src).toContain("classList.toggle('nw-off'");
  });
  it('collapses the Almog bubble to the orb when it would cover page content', () => {
    expect(src).toContain('function alCovers(){');
    expect(src).toMatch(/#al\.ping:not\(\.talk\) \.msg\{opacity:0!important;visibility:hidden!important/);
  });
});

describe('landing-v2 tree lines fit the desktop viewport', () => {
  it('scales the auto-play tree lines by viewport height on desktop', () => {
    expect(src).toMatch(/\.gt\[data-auto\] \.tl-l\{font-size:clamp\(19px,min\(2\.6vw,3\.3vh\),36px\)!important/);
  });
});

describe('landing-v2 round 7', () => {
  it('intro uses the Hebrew display font and waits for it', () => {
    expect(src).toContain("#op .op-msg,#op .op-msg *,.op-seed p,.op-seed p *{font-family:'Secular One'");
    expect(src).toContain("document.fonts.load('400 1em");
    expect(src).toMatch(/secular-lat\.woff2\\" as=\\"font/);
  });
  it('auto-play growth is one continuous eased progression (no per-step jumps)', () => {
    expect(src).toContain('const toP=t=>ez(Math.min(1,t/G))');
    expect(src).not.toContain('(t-cum[k])/durs[k]*.2');
  });
  it('fixed background layers cover the large viewport (no band under a collapsing URL bar)', () => {
    expect(src).toContain('height:calc(100lvh + 80px)!important');
  });
  it('mounts the site cookie notice after the intro with the same storage key and version', () => {
    expect(src).toContain("const KEY='nurawell-cookie-notice',VER='2026-10-20'");
    expect(src).toContain("if(R.classList.contains('op')){setTimeout(wait,400);return}");
  });
  it('has the journey stations and finale', () => {
    expect(src).toContain("className='jfin'");
  });
});

describe('landing mobile fast-scroll painting', () => {
  it('does not lazy-paint sections on mobile (content-visibility off below 821px)', () => {
    expect(src).toContain('@media(max-width:820px){main>section.sec{content-visibility:visible!important');
  });
});
