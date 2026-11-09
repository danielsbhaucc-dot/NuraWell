import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CLIENT_ID, PARENT } from '@/lib/central/parent-connect';
import { LEGAL_POLICY_VERSION } from '@/lib/module-api/privacy-retention/lib-privacy-constants';
import { deleteUserAccountCompletely } from '@/lib/module-api/privacy-retention/lib-privacy-delete-user-account';

/**
 * Deletion lifecycle (owner decision t1252s5335). Before NuraWell deletes a profile it tells the parent, server to server
 * (/id/product/leave, client secret): the NuraWell grant ends; if no other product grant remains, the parent account is
 * scheduled for deletion in 30 days (cancellable in the customer area). The minimal legal section below is sealed by the
 * parent into the person's single legal retention record (7 years, owner / legal only, audited, never for marketing).
 * It carries NO product content: no health data, journals, chats or progress. Consent evidence itself stays in NuraWell's
 * own 7-year evidence store, referenced here by id only.
 */
export type LegalSection = {
  product: 'nurawell';
  requestedAt: string;
  policyVersionNow: string;
  consents: { type: string; granted: boolean; choice: string | null; policyVersion: string; at: string; evidenceId: string | null }[];
  receipts: { kind: string; provider: string | null; providerEventId: string | null; amountIls: number | null; at: string }[];
};

export async function buildLegalSection(admin: SupabaseClient, userId: string, now = new Date()): Promise<LegalSection> {
  const [c, b] = await Promise.all([
    admin.from('user_consents').select('consent_type, granted, choice, policy_version, created_at, evidence_id').eq('user_id', userId).order('created_at', { ascending: true }).limit(500),
    admin.from('billing_events').select('kind, provider, provider_event_id, amount_ils, created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(500),
  ]);
  return {
    product: 'nurawell',
    requestedAt: now.toISOString(),
    policyVersionNow: LEGAL_POLICY_VERSION,
    consents: (c.data ?? []).map((r) => ({ type: r.consent_type, granted: !!r.granted, choice: r.choice ?? null, policyVersion: r.policy_version, at: r.created_at, evidenceId: r.evidence_id ?? null })),
    receipts: (b.data ?? []).map((r) => ({ kind: r.kind, provider: r.provider ?? null, providerEventId: r.provider_event_id ?? null, amountIls: r.amount_ils == null ? null : Number(r.amount_ils), at: r.created_at })),
  };
}

export type LeaveResult =
  | { ok: true; parent: 'kept' | 'scheduled' | 'none'; scheduledFor: string | null }
  | { ok: false; error: 'config' | 'unavailable' };

type Fetch = typeof fetch;

/** Fail closed: if the parent cannot be told, the caller does not delete (so no grant is left behind). */
export async function leaveParent(email: string, section: LegalSection, f: Fetch = fetch, secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? ''): Promise<LeaveResult> {
  if (secret.length < 32) return { ok: false, error: 'config' };
  const res = await f(`${PARENT}/id/product/leave/`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: secret, email, record: section }),
  }).catch(() => null);
  const body = await res?.json().catch(() => null) as { parent?: string; scheduledFor?: string | null } | null;
  if (!res || !res.ok || !body || !['kept', 'scheduled', 'none'].includes(String(body.parent))) {
    console.warn('[parent-leave]', { status: res?.status ?? 0 });
    return { ok: false, error: 'unavailable' };
  }
  return { ok: true, parent: body.parent as 'kept' | 'scheduled' | 'none', scheduledFor: body.scheduledFor ?? null };
}

/**
 * Profile deletion: tell the parent first (fail closed, so a grant is never left behind), then delete NuraWell's own data.
 */
export async function deleteWithParent(admin: SupabaseClient, userId: string, email: string, deps = { leave: leaveParent, del: deleteUserAccountCompletely }) {
  const left = await deps.leave(email, await buildLegalSection(admin, userId));
  if (!left.ok) return { ok: false as const, status: 503, error: 'המחיקה לא בוצעה כי אין כרגע חיבור לחשבון המרכזי. כדאי לנסות שוב בעוד כמה דקות.' };
  const result = await deps.del(admin, userId);
  if (!result.ok) return { ok: false as const, status: 500, error: result.error };
  return { ok: true as const, vectorsRemoved: result.vectorsRemoved, parent: left.parent, scheduledFor: left.scheduledFor };
}
