import { describe, expect, it, vi } from 'vitest';

const recordUserConsent = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/module-api/privacy-retention/lib-privacy-record-consent', () => ({ recordUserConsent }));
const { needsPolicyReaccept, acceptCurrentPolicy } = await import('@/lib/legal/policy-reaccept');
const { LEGAL_POLICY_VERSION } = await import('@/lib/privacy/constants');

describe('policy re-accept', () => {
  it('prompts only onboarded users on an older or missing version', () => {
    expect(needsPolicyReaccept({ onboarding_completed: true, accepted_policy_version: '2026-10-20' }, 'v2')).toBe(true);
    expect(needsPolicyReaccept({ onboarding_completed: true, accepted_policy_version: null }, 'v2')).toBe(true);
    expect(needsPolicyReaccept({ onboarding_completed: true, accepted_policy_version: 'v2' }, 'v2')).toBe(false);
    expect(needsPolicyReaccept({ onboarding_completed: false, accepted_policy_version: null }, 'v2')).toBe(false);
    expect(needsPolicyReaccept(null, 'v2')).toBe(false);
  });

  it('the current version is the 2026-11-09 material change', () => {
    expect(LEGAL_POLICY_VERSION).toBe('2026-11-09');
  });

  it('records terms and privacy at the current version, with the previous version noted', async () => {
    recordUserConsent.mockClear();
    const r = await acceptCurrentPolicy({} as never, 'u1', 'v2', '2026-10-20', 'v2');
    expect(r).toEqual({ ok: true, version: 'v2' });
    expect(recordUserConsent).toHaveBeenCalledTimes(2);
    const types = recordUserConsent.mock.calls.map((c) => (c as unknown as [unknown, { consentType: string; policyVersion: string; source: string }])[1]);
    expect(types.map((t) => t.consentType)).toEqual(['terms', 'privacy']);
    expect(types.every((t) => t.policyVersion === 'v2' && t.source === 'policy_reaccept')).toBe(true);
  });

  it('refuses a stale version and fails when saving fails', async () => {
    expect(await acceptCurrentPolicy({} as never, 'u1', 'old', null, 'v2')).toEqual({ ok: false, status: 409, error: 'stale_version' });
    recordUserConsent.mockResolvedValueOnce({ ok: false, error: 'x' } as never);
    expect(await acceptCurrentPolicy({} as never, 'u1', 'v2', null, 'v2')).toEqual({ ok: false, status: 500, error: 'save_failed' });
  });
});
