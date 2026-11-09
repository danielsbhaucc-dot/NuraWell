import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_POLICY_VERSION, CONSENT_TYPES } from '@/lib/module-api/privacy-retention/lib-privacy-constants';
import { recordUserConsent } from '@/lib/module-api/privacy-retention/lib-privacy-record-consent';

/**
 * Re-acceptance of the privacy policy and terms after a material change (owner decision t1256s5353).
 * Users who finished onboarding on an older policy version see a blocking prompt until they accept.
 * Users still registering accept the current version on the registration form, so they are not prompted.
 */
export type PolicyProfile = { onboarding_completed?: boolean | null; accepted_policy_version?: string | null } | null | undefined;

export function needsPolicyReaccept(profile: PolicyProfile, current: string = LEGAL_POLICY_VERSION): boolean {
  if (!profile || profile.onboarding_completed !== true) return false;
  return (profile.accepted_policy_version ?? null) !== current;
}

export type AcceptResult = { ok: true; version: string } | { ok: false; status: number; error: string };

/** Records terms + privacy acceptance of the current version. A stale version from an old tab is refused. */
export async function acceptCurrentPolicy(
  admin: SupabaseClient,
  userId: string,
  version: string,
  previous: string | null,
  current: string = LEGAL_POLICY_VERSION,
): Promise<AcceptResult> {
  if (version !== current) return { ok: false, status: 409, error: 'stale_version' };
  const metadata = { previous_version: previous, prompt: 'policy_reaccept' };
  for (const consentType of [CONSENT_TYPES.terms, CONSENT_TYPES.privacy] as const) {
    const r = await recordUserConsent(admin, { userId, consentType, granted: true, source: 'policy_reaccept', metadata, policyVersion: current });
    if (!r.ok) return { ok: false, status: 500, error: 'save_failed' };
  }
  return { ok: true, version: current };
}
