import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionIdFromJwt } from './device-gate';

/** Device meta (IP/country/browser) refresh is throttled to once per window per device. */
export const META_THROTTLE_MS = 5 * 60_000;

/**
 * Per-device sessions: the first time an admin session is seen it is bound to the enrolled device; afterwards it is
 * only accepted from that same device and only while the binding isn't revoked. Fails closed (no session id / DB error).
 */
export async function bindAdminSession(db: SupabaseClient, userId: string, deviceId: string, accessToken: string | null | undefined): Promise<boolean> {
  const sid = sessionIdFromJwt(accessToken);
  if (!sid) return false;
  const { data, error } = await db.rpc('ops_bind_admin_session', { p_user: userId, p_session: sid, p_device: deviceId });
  if (error) return false;
  if (data === true) return true;
  // same session across the app host and the Ops host: accept the handoff parent/child of the bound device (both live)
  const { data: b } = await db.from('ops_admin_sessions').select('device_id, user_id, revoked_at').eq('session_id', sid).maybeSingle();
  const row = b as { device_id: string; user_id: string; revoked_at: string | null } | null;
  if (!row || row.revoked_at || row.user_id !== userId) return false;
  const { data: fam } = await db.from('ops_trusted_devices').select('id, parent_id, revoked_at').in('id', [row.device_id, deviceId]);
  const rows = (fam ?? []) as { id: string; parent_id: string | null; revoked_at: string | null }[];
  const bound = rows.find((r) => r.id === row.device_id); const cur = rows.find((r) => r.id === deviceId);
  return Boolean(bound && cur && !bound.revoked_at && !cur.revoked_at && (cur.parent_id === bound.id || bound.parent_id === cur.id));
}

export function browserLabel(ua: string | null | undefined): string {
  const u = ua ?? '';
  const b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'דפדפן';
  const os = /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Mac OS X/.test(u) ? 'macOS' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}

type Facts = { ipHash: string | null; ipMasked: string; country: string | null; browser: string };
type Row = { meta_seen_at: string | null; countries_seen: string[] | null; last_country: string | null };

/** Throttled last-seen refresh. Returns the country when it is new for this device (caller alerts). */
export async function touchDeviceMeta(db: SupabaseClient, deviceId: string, f: Facts, now = Date.now()): Promise<{ updated: boolean; newCountry: string | null }> {
  const { data } = await db.from('ops_trusted_devices').select('meta_seen_at, countries_seen, last_country').eq('id', deviceId).maybeSingle();
  const r = data as Row | null;
  if (!r) return { updated: false, newCountry: null };
  if (r.meta_seen_at && now - Date.parse(r.meta_seen_at) < META_THROTTLE_MS) return { updated: false, newCountry: null };
  const seen = new Set([...(r.countries_seen ?? []), ...(r.last_country ? [r.last_country] : [])]);
  const newCountry = f.country && seen.size > 0 && !seen.has(f.country) ? f.country : null;
  if (f.country) seen.add(f.country);
  const patch: Record<string, unknown> = { meta_seen_at: new Date(now).toISOString(), countries_seen: [...seen], browser: f.browser };
  if (f.ipHash) { patch.last_ip_hash = f.ipHash; patch.last_ip_masked = f.ipMasked; }
  if (f.country) patch.last_country = f.country;
  // conditional on the old stamp so two concurrent requests don't both alert
  let q = db.from('ops_trusted_devices').update(patch).eq('id', deviceId);
  q = r.meta_seen_at ? q.eq('meta_seen_at', r.meta_seen_at) : q.is('meta_seen_at', null);
  const { data: upd } = await q.select('id');
  const won = Boolean((upd as unknown[] | null)?.length);
  return { updated: won, newCountry: won ? newCountry : null };
}

/** Request → facts, then touch + Gideon alert on a new country. Never throws. */
export async function refreshDeviceFromRequest(db: SupabaseClient, userId: string, deviceId: string, h: Headers): Promise<void> {
  try {
    const rf = await import('@/lib/platform/access/request-facts');
    const ip = rf.clientIp(h);
    const out = await touchDeviceMeta(db, deviceId, { ipHash: rf.ipHash(ip) || null, ipMasked: rf.maskIp(ip), country: rf.country(h) || null, browser: browserLabel(h.get('user-agent')) });
    if (out.newCountry) {
      const { alertOwnerSecurity } = await import('./device-notify');
      await alertOwnerSecurity(db, userId, `🌍 מכשיר ניהול מוכר נכנס ממדינה חדשה (${out.newCountry}, ${browserLabel(h.get('user-agent'))}). אם זה לא אתם, בטלו את המכשיר ממסך המכשירים.`, 'NuraWell: מכשיר ניהול ממדינה חדשה', { buttons: [[{ text: '🗑️ בטלו את המכשיר', data: `ceo:dr:${deviceId}` }]] });
    }
  } catch { /* best effort */ }
}

/** Ends only this device's sessions (and its handoff children's). Returns how many auth sessions were deleted. */
export async function revokeDeviceSessions(db: SupabaseClient, deviceId: string): Promise<number> {
  const { data: kids } = await db.from('ops_trusted_devices').select('id').eq('parent_id', deviceId);
  let n = 0;
  for (const id of [deviceId, ...((kids ?? []) as { id: string }[]).map((k) => k.id)]) {
    const { data } = await db.rpc('ops_revoke_device_sessions', { p_device: id });
    n += typeof data === 'number' ? data : 0;
  }
  return n;
}

/** "Revoke all": every session of this admin, on every device. Devices stay enrolled. */
export async function revokeAllAdminSessions(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.rpc('ops_revoke_all_admin_sessions', { p_user: userId });
  return typeof data === 'number' ? data : 0;
}
