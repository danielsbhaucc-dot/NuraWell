import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('parent account transparency notice (t1252s5335)', () => {
  it('is shown in privacy settings and in the profile', () => {
    expect(read('components/settings/PrivacySettingsClient.tsx')).toMatch(/<ParentAccountNotice \/>/);
    expect(read('components/profile/ProfilePageClient.tsx')).toMatch(/<ParentAccountNotice \/>/);
  });
  it('is stated in the privacy policy', () => {
    expect(read('app/privacy/page.tsx')).toMatch(/חשבון המרכזי של חברת האם/);
  });
  it('is not added to the frozen login / signup screens', () => {
    for (const p of ['app/login/page.tsx', 'app/register/page.tsx']) {
      try { expect(read(p)).not.toMatch(/ParentAccountNotice/); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
  });
});
