import { describe, expect, it } from 'vitest';
import { buildProfileSummaryRows } from '@/lib/onboarding/profile-summary-rows';

type Src = Parameters<typeof buildProfileSummaryRows>[0];

describe('profile summary sleep row', () => {
  it('shows HH:MM with labels, not raw seconds', () => {
    const row = buildProfileSummaryRows({ wake_up_time: '07:00:00', sleep_time: '23:00:00' } as unknown as Src).find((r) => r.label === 'קימה ושינה');
    expect(row?.value).toBe('קימה 07:00 · שינה 23:00');
  });
  it('missing times show a dash', () => {
    const row = buildProfileSummaryRows({ wake_up_time: null, sleep_time: null } as unknown as Src).find((r) => r.label === 'קימה ושינה');
    expect(row?.value).toBe('קימה — · שינה —');
  });
});
