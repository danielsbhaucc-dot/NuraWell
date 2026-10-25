import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeLessonHtml, sanitizeSvg } from '@/lib/sanitize-lesson-html';

describe('DOMPurify lesson sanitizer', () => {
  it('keeps real lesson formatting', () => {
    const html = '<h2>כותרת</h2><p><strong>חזק</strong> <em>נטוי</em></p><ul><li>א</li></ul><blockquote>ציטוט</blockquote><h3>ת</h3>';
    expect(sanitizeLessonHtml(html)).toBe(html);
  });
  it.each([
    '<img src=x onerror=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<form><button formaction="javascript:alert(1)">x</button></form>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<details open ontoggle=alert(1)>',
    '<style>@import "//evil"</style>',
  ])('neutralises %s', (payload) => {
    const out = sanitizeLessonHtml(payload).toLowerCase();
    expect(out).not.toMatch(/onerror|ontoggle|<script|javascript:|data:text|<iframe|<style|formaction|srcdoc/);
  });
  it('adds noopener to target=_blank links', () => {
    expect(sanitizeLessonHtml('<a href="https://x.com" target="_blank">x</a>')).toContain('rel="noopener noreferrer"');
  });
  it('SVG sanitizer keeps QR paths and strips script/foreignObject/handlers', () => {
    const qr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1v1H0z" fill="#000"/></svg>';
    expect(sanitizeSvg(qr)).toContain('<path');
    const evil = sanitizeSvg('<svg onload=alert(1)><script>alert(1)</script><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>');
    expect(evil).not.toMatch(/onload|<script|foreignObject|onerror/i);
  });
});

describe('every dangerouslySetInnerHTML is sanitized or a reviewed static script', () => {
  const ROOT = join(__dirname, '..');
  const walk = (d: string, o: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, o);
      else if (/\.tsx$/.test(n)) o.push(p);
    }
    return o;
  };
  /** app-authored constant scripts with CSP nonce, no user input */
  const STATIC_SCRIPTS = new Set(['app/demo/layout.tsx', 'app/layout.tsx']);
  it('has no unsanitized sinks', () => {
    const bad: string[] = [];
    for (const p of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]) {
      const rel = relative(ROOT, p).replace(/\\/g, '/');
      const src = readFileSync(p, 'utf8');
      for (const m of src.match(/dangerouslySetInnerHTML=\{\{\s*__html:\s*[^}]*\}/g) ?? []) {
        if (STATIC_SCRIPTS.has(rel)) continue;
        if (!/sanitize(LessonHtml|Svg)\(/.test(m)) bad.push(`${rel}: ${m}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
