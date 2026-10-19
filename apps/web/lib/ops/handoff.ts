/**
 * Main site → Ops host handoff. Ops has no login page: an admin on a trusted main-site device gets a
 * 60-second, single-use token (only its hash is stored), bound to user + device + client (UA/IP).
 * The Ops host verifies it and mints its OWN session (magic-link token generated server-side, never emailed)
 * plus an Ops device cookie that is a child of the main-site device (revoking the parent revokes it).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { audit } from './device-trust';

export const HANDOFF_TTL_MS = 60_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function clientFingerprint(h: Headers): string {
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim();
  return sha(`${h.get('user-agent') ?? ''}|${ip}`);
}

export async function createHandoff(db: SupabaseClient, userId: string, deviceId: string, h: Headers): Promise<string> {
  const secret = randomBytes(32).toString('base64url');
  const { data, error } = await db.from('ops_handoff_tokens').insert({
    user_id: userId, device_id: deviceId, token_hash: sha(secret), client_hash: clientFingerprint(h),
    expires_at: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
  }).select('id').single();
  if (error || !data) throw new Error(`handoff: ${error?.message}`);
  await audit(db, userId, 'ops_handoff_created', { device: deviceId });
  return `${(data as { id: string }).id}.${secret}`;
}

export type HandoffClaim = { ok: true; userId: string; deviceId: string } | { ok: false; reason: string };

/** Atomic single use; expiry, client binding and live parent device enforced. */
export async function claimHandoff(db: SupabaseClient, token: string, h: Headers, now = Date.now()): Promise<HandoffClaim> {
  const [id, secret] = (token ?? '').split('.');
  if (!id || !secret || !/^[0-9a-f-]{36}$/.test(id) || secret.length > 64) return { ok: false, reason: 'malformed' };
  const { data } = await db.from('ops_handoff_tokens').select('id, user_id, device_id, token_hash, client_hash, expires_at, used_at').eq('id', id).maybeSingle();
  const r = data as { id: string; user_id: string; device_id: string; token_hash: string; client_hash: string; expires_at: string; used_at: string | null } | null;
  const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!r || !eq(r.token_hash, sha(secret))) return { ok: false, reason: 'unknown' };
  if (r.used_at) { await audit(db, r.user_id, 'ops_handoff_replay', { id }); return { ok: false, reason: 'replay' }; }
  if (Date.parse(r.expires_at) <= now) return { ok: false, reason: 'expired' };
  const { data: used } = await db.from('ops_handoff_tokens').update({ used_at: new Date(now).toISOString() }).eq('id', id).is('used_at', null).select('id');
  if (!used?.length) return { ok: false, reason: 'replay' };
  if (!eq(r.client_hash, clientFingerprint(h))) { await audit(db, r.user_id, 'ops_handoff_client_mismatch', { id }); return { ok: false, reason: 'client' }; }
  const { data: dev } = await db.from('ops_trusted_devices').select('revoked_at, user_id').eq('id', r.device_id).maybeSingle();
  const d = dev as { revoked_at: string | null; user_id: string } | null;
  if (!d || d.revoked_at || d.user_id !== r.user_id) return { ok: false, reason: 'device' };
  const { data: prof } = await db.from('profiles').select('role').eq('id', r.user_id).maybeSingle();
  if ((prof as { role?: string } | null)?.role !== 'admin') return { ok: false, reason: 'role' };
  await audit(db, r.user_id, 'ops_handoff_used', { id });
  return { ok: true, userId: r.user_id, deviceId: r.device_id };
}
