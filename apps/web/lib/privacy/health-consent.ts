/**
 * Health-data consent (Privacy Protection Law: "information of special sensitivity").
 * Withdrawal is recorded in user_consents (granted=false + policy version), the health
 * fields are wiped, and later writes of health fields are blocked until the user re-grants.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordUserConsent } from './record-consent';
import { CONSENT_TYPES } from './constants';
import { scrubHealthFromMemory, type HealthScrubResult } from './health-memory';
import { scrubHealthFromChatHistory, type HistoryScrubResult } from './health-history-scrub';

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

/** Links privacy audit rows to the signed consent evidence record of the same request. */
export type HealthConsentMeta = { source: string; evidenceId?: string | null; requestId?: string | null };
function evidenceLink(m: HealthConsentMeta): Record<string, string> {
  const o: Record<string, string> = {};
  if (m.evidenceId) o.evidence_id = m.evidenceId;
  if (m.requestId) o.request_id = m.requestId;
  return o;
}

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

export type HealthConsentStatus = 'granted' | 'withdrawn' | 'unknown' | 'error';
type StatusLookup = (userId: string) => Promise<HealthConsentStatus | boolean>;
let lookupOverride: StatusLookup | null = null;
/** For tests only. Return a status, or `true` (= withdrawn) / `false` (= granted). */
export function __setHealthBlockLookup(fn: StatusLookup | null) {
  lookupOverride = fn;
}
/** Kept for API compatibility: there is no cache, every check reads the latest decision. */
export function clearHealthBlockCache(_userId: string) {
  void _userId;
}

/** Latest decision, no cache (withdraw/grant apply immediately). */
export async function healthConsentStatus(userId: string): Promise<HealthConsentStatus> {
  try {
    if (lookupOverride) {
      const v = await lookupOverride(userId);
      return v === true ? 'withdrawn' : v === false ? 'granted' : v;
    }
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const state = await getHealthConsentState(createAdminClient(), userId);
    return state.granted === true ? 'granted' : state.granted === false ? 'withdrawn' : 'unknown';
  } catch {
    return 'error';
  }
}

/**
 * Health writes are allowed only with an explicit grant on record.
 * Withdrawn, legacy (no record) and lookup errors all block (fail closed).
 */
export async function isHealthProcessingBlocked(userId: string): Promise<boolean> {
  return (await healthConsentStatus(userId)) !== 'granted';
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
  meta: HealthConsentMeta,
  scrub: typeof scrubHealthFromMemory = scrubHealthFromMemory,
  scrubHistory: (a: SupabaseClient, u: string) => Promise<HistoryScrubResult> = scrubHealthFromChatHistory
): Promise<{ ok: true; measurementsDeleted: number; memory: HealthScrubResult | null } | { ok: false; error: string }> {
  const rec = await recordUserConsent(admin, {
    userId,
    consentType: CONSENT_TYPES.healthData,
    granted: false,
    source: meta.source,
    metadata: { data_wiped: true, ...evidenceLink(meta) },
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

  let memory: HealthScrubResult | null = null;
  try {
    memory = await scrub(admin, userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'memory scrub failed' };
  }

  let history: HistoryScrubResult | null = null;
  try {
    history = await scrubHistory(admin, userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'history scrub failed' };
  }

  await admin
    .from('admin_audit_log')
    .insert({
      actor_id: userId,
      method: 'PRIVACY',
      path: 'health_consent_withdrawn',
      detail: { measurements_deleted: count ?? 0, memory, history, source: meta.source, ...evidenceLink(meta) },
    })
    .then(
      () => undefined,
      () => undefined
    );

  return { ok: true, measurementsDeleted: count ?? 0, memory };
}

export async function grantHealthConsent(
  admin: SupabaseClient,
  userId: string,
  meta: HealthConsentMeta
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = await recordUserConsent(admin, {
    userId,
    consentType: CONSENT_TYPES.healthData,
    granted: true,
    source: meta.source,
    metadata: evidenceLink(meta),
  });
  if (!rec.ok) return rec;
  clearHealthBlockCache(userId);
  await admin
    .from('admin_audit_log')
    .insert({ actor_id: userId, method: 'PRIVACY', path: 'health_consent_granted', detail: { source: meta.source, ...evidenceLink(meta) } })
    .then(
      () => undefined,
      () => undefined
    );
  return { ok: true };
}
