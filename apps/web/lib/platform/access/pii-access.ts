import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { grantCovers, grantExpiry, validateJustification, type PiiGrant } from '@platform/access';
import { requestFacts } from './request-facts';

/**
 * Justification-gated PII access (product-agnostic; product passed in). A route that returns a subject's
 * personal data calls requirePiiGrant first: no live grant → 403 + `pii_justification_required` and a
 * `denied` row; live grant → a `view` row. Logging failures fail CLOSED (no log, no data).
 */
export const PII_REQUIRED_CODE = 'pii_justification_required';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = { id: string; product_id: string; actor_id: string; subject_id: string; reason: string; ticket_ref: string | null; created_at: string; expires_at: string; revoked_at: string | null };
const toGrant = (r: Row): PiiGrant => ({
  id: r.id, productId: r.product_id, actorId: r.actor_id, subjectId: r.subject_id, reason: r.reason, ticketRef: r.ticket_ref,
  createdAt: Date.parse(r.created_at), expiresAt: Date.parse(r.expires_at), revokedAt: r.revoked_at ? Date.parse(r.revoked_at) : null,
});

export function piiEnforced(): boolean {
  return process.env.PII_JUSTIFICATION !== 'off' || process.env.NODE_ENV === 'production';
}

async function log(db: SupabaseClient, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from('pii_access_log').insert(row);
  return !error;
}

export async function liveGrant(db: SupabaseClient, q: { productId: string; actorId: string; subjectId: string }, now = Date.now()): Promise<PiiGrant | null> {
  const { data } = await db.from('pii_access_grants').select('*').eq('product_id', q.productId).eq('actor_id', q.actorId).eq('subject_id', q.subjectId)
    .is('revoked_at', null).gt('expires_at', new Date(now).toISOString()).order('expires_at', { ascending: false }).limit(1);
  const g = (data as Row[] | null)?.[0];
  const grant = g ? toGrant(g) : null;
  return grantCovers(grant, q, now) ? grant : null;
}

export async function createPiiGrant(db: SupabaseClient, req: Request, q: { productId: string; actorId: string; subjectId: string; reason: unknown; ticketRef?: unknown }) {
  if (!UUID.test(q.subjectId)) return { ok: false as const, error: 'subject_invalid' };
  const v = validateJustification(q.reason, q.ticketRef);
  if (!v.ok) return { ok: false as const, error: v.error };
  const f = requestFacts(req.headers);
  const now = Date.now();
  const { data, error } = await db.from('pii_access_grants').insert({
    product_id: q.productId, actor_id: q.actorId, subject_id: q.subjectId, reason: v.reason, ticket_ref: v.ticketRef,
    created_at: new Date(now).toISOString(), expires_at: new Date(grantExpiry(now)).toISOString(), ip_hash: f.ipHash, country: f.country,
  }).select('id, expires_at').single();
  if (error || !data) return { ok: false as const, error: 'store_failed' };
  const g = data as { id: string; expires_at: string };
  if (!(await log(db, { product_id: q.productId, actor_id: q.actorId, subject_id: q.subjectId, grant_id: g.id, event: 'grant', resource: 'grant', ip_hash: f.ipHash, country: f.country }))) {
    await db.from('pii_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', g.id);
    return { ok: false as const, error: 'log_failed' };
  }
  return { ok: true as const, id: g.id, expiresAt: g.expires_at };
}

/** Returns null when allowed (view logged) or a 403 response to return as-is. */
export async function requirePiiGrant(db: SupabaseClient, req: Request, q: { productId: string; actorId: string; subjectId: string; resource: string }): Promise<NextResponse | null> {
  if (!piiEnforced()) return null;
  const f = requestFacts(req.headers);
  const base = { product_id: q.productId, actor_id: q.actorId, subject_id: UUID.test(q.subjectId) ? q.subjectId : null, resource: q.resource.slice(0, 80), ip_hash: f.ipHash, country: f.country };
  const g = UUID.test(q.subjectId) ? await liveGrant(db, q) : null;
  if (!g) {
    await log(db, { ...base, event: 'denied' });
    return NextResponse.json({ error: 'כדי לצפות במידע האישי צריך לכתוב סיבה.', code: PII_REQUIRED_CODE, subjectId: q.subjectId }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!(await log(db, { ...base, grant_id: g.id, event: 'view' }))) {
    return NextResponse.json({ error: 'רישום הגישה נכשל, לכן המידע לא מוצג.', code: 'pii_log_failed' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

export async function revokePiiGrant(db: SupabaseClient, q: { productId: string; actorId: string; grantId: string }) {
  const { data } = await db.from('pii_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', q.grantId).eq('actor_id', q.actorId).is('revoked_at', null).select('subject_id');
  const s = (data as { subject_id: string }[] | null)?.[0];
  if (s) await log(db, { product_id: q.productId, actor_id: q.actorId, subject_id: s.subject_id, grant_id: q.grantId, event: 'revoke', resource: 'grant' });
  return Boolean(s);
}
