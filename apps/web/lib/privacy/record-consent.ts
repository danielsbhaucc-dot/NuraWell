import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_POLICY_VERSION, type ConsentType } from './constants';

export type RecordConsentInput = {
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  source: string;
  metadata?: Record<string, unknown>;
  policyVersion?: string;
};

export async function recordUserConsent(
  admin: SupabaseClient,
  input: RecordConsentInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const policyVersion = input.policyVersion ?? LEGAL_POLICY_VERSION;
  const now = new Date().toISOString();

  const { error: insertError } = await admin.from('user_consents').insert({
    user_id: input.userId,
    consent_type: input.consentType,
    granted: input.granted,
    policy_version: policyVersion,
    source: input.source,
    metadata: input.metadata ?? {},
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const profilePatch: Record<string, string> = {};
  if (input.granted && input.consentType === 'terms') profilePatch.terms_accepted_at = now;
  if (input.granted && input.consentType === 'privacy') profilePatch.privacy_accepted_at = now;
  if (input.granted && input.consentType === 'health_data') profilePatch.health_data_consent_at = now;
  if (input.granted && input.consentType === 'parental_guardian') {
    profilePatch.parental_consent_at = now;
  }
  if (input.granted && (input.consentType === 'terms' || input.consentType === 'privacy')) {
    profilePatch.accepted_policy_version = policyVersion;
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error: profileError } = await admin
      .from('profiles')
      .update(profilePatch)
      .eq('id', input.userId);
    if (profileError) {
      return { ok: false, error: profileError.message };
    }
  }

  return { ok: true };
}

export async function recordRegistrationConsents(
  admin: SupabaseClient,
  params: {
    userId: string;
    source: string;
    healthData: boolean;
    parentalGuardian: boolean;
    birthDate: string;
    age: number;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseMeta = { birth_date: params.birthDate, age: params.age };

  const steps: RecordConsentInput[] = [
    {
      userId: params.userId,
      consentType: 'terms',
      granted: true,
      source: params.source,
      metadata: baseMeta,
    },
    {
      userId: params.userId,
      consentType: 'privacy',
      granted: true,
      source: params.source,
      metadata: baseMeta,
    },
    {
      userId: params.userId,
      consentType: 'age_declaration',
      granted: true,
      source: params.source,
      metadata: baseMeta,
    },
    {
      userId: params.userId,
      consentType: 'health_data',
      granted: params.healthData,
      source: params.source,
      metadata: baseMeta,
    },
  ];

  if (params.parentalGuardian) {
    steps.push({
      userId: params.userId,
      consentType: 'parental_guardian',
      granted: true,
      source: params.source,
      metadata: baseMeta,
    });
  }

  for (const step of steps) {
    const result = await recordUserConsent(admin, step);
    if (!result.ok) return result;
  }

  return { ok: true };
}
