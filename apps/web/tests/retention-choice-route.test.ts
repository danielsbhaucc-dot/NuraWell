import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

describe('retention choice wiring', () => {
  it('onboarding requires an explicit choice (no default) and records it', () => {
    const action = src('lib/actions/complete-onboarding.ts');
    expect(action).toMatch(/post_sub_retention: z\.enum\(\['delete_now', 'keep_24m'\]/);
    expect(action).toMatch(/recordRetentionChoice\(admin, \{[\s\S]*source: 'onboarding'/);
    const form = src('components/onboarding/OnboardingFormClient.tsx');
    expect(form).toMatch(/useState<RetentionChoice \| null>\(null\)/);
    expect(form).toMatch(/if \(!retentionChoice\)/);
  });
  it('settings route validates, records previous choice and blocks demo sessions', () => {
    const r = src('app/api/v1/account/retention-choice/route.ts');
    expect(r).toMatch(/z\.enum\(\['delete_now', 'keep_24m'\]\)/);
    expect(r).toMatch(/source: 'settings'/);
    expect(r).toMatch(/previous/);
    expect(r).toMatch(/assertNotDemoAccessSession/);
  });
  it('picker has no preselected option', () => {
    const p = src('components/privacy/RetentionChoicePicker.tsx');
    expect(p).toMatch(/value: RetentionChoice \| null/);
    expect(p).not.toMatch(/#fff\b|bg-white(?![/\w-])/);
  });
});
