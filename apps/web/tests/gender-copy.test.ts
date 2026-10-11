import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
import { GENDER_SLASH_RE, gx } from '../lib/i18n/gender';
import { genderCopy, commitmentCopy } from '../lib/onboarding/gender-copy';

/** User-facing copy (dashboard, onboarding, auth, settings, notifications) must not use slash gender forms. */
const ROOTS = ['components', 'app/(dashboard)', 'app/(auth)', 'lib/onboarding', 'lib/privacy', 'lib/email'];
const EXTRA = ['lib/admin/chat-transcript-notify.ts'];
const SKIP = [/components\/admin\//];

describe('gender-aware copy', () => {
  it('gx picks by gender, neutral without slashes', () => {
    expect(gx('female', { m: 'לחץ', f: 'לחצי', n: 'לחצו' })).toBe('לחצי');
    expect(gx(null, { m: 'לחץ', f: 'לחצי', n: 'לחצו' })).toBe('לחצו');
    expect(Object.values(genderCopy('')).some((v) => GENDER_SLASH_RE.test(v))).toBe(false);
    expect(GENDER_SLASH_RE.test(commitmentCopy(null).button)).toBe(false);
  });
  it('no slash gender forms in user-facing strings', () => {
    const bad: string[] = [];
    for (const files of [...ROOTS.map((r) => walk(r)), EXTRA]) {
      for (const f of files) {
        if (SKIP.some((re) => re.test(f))) continue;
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          if (GENDER_SLASH_RE.test(line)) bad.push(`${f}:${i + 1}: ${t.slice(0, 80)}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });
});
