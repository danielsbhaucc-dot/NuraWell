/**
 * Health-data consent (Privacy Protection Law: "information of special sensitivity").
 * Withdrawal is recorded in user_consents (granted=false + policy version), the health
 * fields are wiped, and later writes of health fields are blocked until the user re-grants.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordUserConsent } from './record-consent';
import { CONSENT_TYPES } from './constants';

/** profiles columns that hold health data. */
export const HEALTH_PROFILE_FIELDS = [
  'current_weight_kg',
  'goal_weight_kg',
  'height_cm',
  'health_conditions',
  'dietary_preferences',
  'activity_level',
] as const;

/** Values written on withdrawal (jsonb columns keep an empty array, activity_level nulls). */
export const HEALTH_PROFILE_WIPE: Record<(typeof HEALTH_PROFILE_FIELDS)[number], unknown> = {
  current_weight_kg: null,
  goal_weight_kg: null,
  height_cm: null,
  health_conditions: [],
  dietary_preferences: [],
  activity_level: null,
};

export type HealthConsentState = { granted: boolean | null; at: string | null };

/** Latest explicit health_data consent decision (null = never recorded). */
export async function getHealthConsentState(admin: SupabaseClient, userId: string): Promise<HealthConsentState> {
  const { data, error } = await admin
    .from('user_consents')
    .select('granted, created_at')
    .eq('user_id', userId)
    .eq('consent_type', CONSENT_TYPES.healthData)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { granted: null, at: null };
  const row = data as { granted: boolean; created_at: string };
  return { granted: row.granted, at: row.created_at };
}

type BlockLookup = (userId: string) => Promise<boolean>;
let lookupOverride: BlockLookup | null = null;
const cache = new Map<string, { v: boolean; at: number }>();
/** For tests only. */
export function __setHealthBlockLookup(fn: BlockLookup | null) {
  lookupOverride = fn;
  cache.clear();
}
export function clearHealthBlockCache(userId: string) {
  cache.delete(userId);
}

/** True when the user's latest health-data decision is an explicit withdrawal. */
export async function isHealthProcessingBlocked(userId: string): Promise<boolean> {
  if (lookupOverride) return lookupOverride(userId);
  const c = cache.get(userId);
  if (c && Date.now() - c.at < 30_000) return c.v;
  let v = false;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const state = await getHealthConsentState(createAdminClient(), userId);
    v = state.granted === false;
  } catch {
    v = false;
  }
  cache.set(userId, { v, at: Date.now() });
  return v;
}

/** Removes health fields from a profile patch. */
export function stripHealthFields<T extends Record<string, unknown>>(patch: T): T {
  const out: Record<string, unknown> = { ...patch };
  for (const k of HEALTH_PROFILE_FIELDS) delete out[k];
  return out as T;
}

export function patchHasHealthFields(patch: Record<string, unknown>): boolean {
  return HEALTH_PROFILE_FIELDS.some((k) => k in patch);
}

/** Withdraw consent: record it, wipe health data, audit. */
export async function withdrawHealthConsent(
  admin: SupabaseClient,
  userId: string,
  meta: { source: string }
): Promise<{ ok: true; measurementsDeleted: number } | { ok: false; error: string }> {
  const rec = await recordUserConsent(admin, {
    userId,
    consentType: CONSENT_TYPES.healthData,
    granted: false,
    source: meta.source,
    metadata: { data_wiped: true },
  });
  if (!rec.ok) return rec;
  clearHealthBlockCache(userId);

  const { error: pErr } = await admin
    .from('profiles')
    .update({ ...HEALTH_PROFILE_WIPE, health_data_consent_at: null })
    .eq('id', userId);
  if (pErr) return { ok: false, error: pErr.message };

  const { error: mErr, count } = await admin
    .from('user_measurements')
    .delete({ count: 'exact' })
    .eq('user_id', userId);
  if (mErr) return { ok: false, error: mErr.message };

  await admin
    .from('admin_audit_log')
    .insert({
      actor_id: userId,
      method: 'PRIVACY',
      path: 'health_consent_withdrawn',
      detail: { measurements_deleted: count ?? 0, source: meta.source },
    })
    .then(
      () => undefined,
      () => undefined
    );

  return { ok: true, measurementsDeleted: count ?? 0 };
}

export async function grantHealthConsent(
  admin: SupabaseClient,
  userId: string,
  meta: { source: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = await recordUserConsent(admin, {
    userId,
    consentType: CONSENT_TYPES.healthData,
    granted: true,
    source: meta.source,
  });
  if (!rec.ok) return rec;
  clearHealthBlockCache(userId);
  await admin
    .from('admin_audit_log')
    .insert({ actor_id: userId, method: 'PRIVACY', path: 'health_consent_granted', detail: { source: meta.source } })
    .then(
      () => undefined,
      () => undefined
    );
  return { ok: true };
}
