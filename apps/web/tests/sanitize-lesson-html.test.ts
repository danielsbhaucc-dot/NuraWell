import { describe, expect, it } from 'vitest';

import { sanitizeLessonHtml } from '../lib/sanitize-lesson-html';

describe('sanitizeLessonHtml — blocks XSS vectors', () => {
  it('strips <script> blocks', () => {
    expect(sanitizeLessonHtml('<p>hi</p><script>alert(1)</script>')).not.toMatch(/<script/i);
  });

  it('strips inline event handlers (onerror/ontoggle/onclick)', () => {
    expect(sanitizeLessonHtml('<img src=x onerror=alert(1)>')).not.toMatch(/onerror/i);
    expect(sanitizeLessonHtml('<details open ontoggle=alert(1)>')).not.toMatch(/ontoggle/i);
    expect(sanitizeLessonHtml('<a/onclick=alert(1)>x</a>')).not.toMatch(/onclick/i);
  });

  it('removes plain javascript: in href (quoted and unquoted)', () => {
    expect(sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
    expect(sanitizeLessonHtml('<a href=javascript:alert(1)>x</a>')).not.toMatch(/javascript:/i);
  });

  it('removes case-mangled and vbscript schemes', () => {
    expect(sanitizeLessonHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toMatch(/javascript:/i);
    expect(sanitizeLessonHtml('<a href="vbscript:msgbox(1)">x</a>')).not.toMatch(/vbscript:/i);
  });

  it('closes entity-encoded scheme bypass (&#106;avascript:)', () => {
    const out = sanitizeLessonHtml('<a href="&#106;avascript:alert(1)">x</a>');
    // after decoding, no javascript: scheme should remain reachable
    const decoded = out.replace(/&#106;?/gi, 'j');
    expect(decoded).not.toMatch(/javascript:/i);
  });

  it('closes whitespace/tab-in-scheme bypass', () => {
    expect(sanitizeLessonHtml('<a href="java\tscript:alert(1)">x</a>')).not.toMatch(/href\s*=/i);
    expect(sanitizeLessonHtml('<a href=" javascript:alert(1)">x</a>')).not.toMatch(/href\s*=/i);
  });

  it('closes the "/" attribute-separator bypass', () => {
    expect(sanitizeLessonHtml('<a/href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });

  it('removes javascript: in xlink:href (svg)', () => {
    expect(sanitizeLessonHtml('<svg><a xlink:href="javascript:alert(1)">x</a></svg>')).not.toMatch(/javascript:/i);
  });

  it('blocks data: URIs in href/src', () => {
    expect(sanitizeLessonHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toMatch(/data:text\/html/i);
  });
});

describe('sanitizeLessonHtml — preserves legitimate content', () => {
  it('keeps safe https links and text', () => {
    const out = sanitizeLessonHtml('<p>שלום <a href="https://nurawell.ai/guide">מדריך</a></p>');
    expect(out).toContain('href="https://nurawell.ai/guide"');
    expect(out).toContain('מדריך');
  });

  it('keeps relative links and images', () => {
    const out = sanitizeLessonHtml('<a href="/guides/1">link</a><img src="https://cdn.nurawell.ai/a.png">');
    expect(out).toContain('href="/guides/1"');
    expect(out).toContain('src="https://cdn.nurawell.ai/a.png"');
  });

  it('keeps common formatting tags', () => {
    const html = '<h2>כותרת</h2><ul><li><strong>פריט</strong></li></ul><p><em>נטוי</em></p>';
    expect(sanitizeLessonHtml(html)).toBe(html);
  });

  it('returns empty string for nullish input', () => {
    expect(sanitizeLessonHtml(null)).toBe('');
    expect(sanitizeLessonHtml(undefined)).toBe('');
    expect(sanitizeLessonHtml('')).toBe('');
  });
});
