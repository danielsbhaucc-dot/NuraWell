/**
 * Main site → Ops host handoff. Ops has no login page: an admin on a trusted main-site device gets a
 * 60-second, single-use token (only its hash is stored), bound to user + device + client (UA + network prefix / country).
 * The Ops host verifies it and mints its OWN session (magic-link token generated server-side, never emailed)
 * plus an Ops device cookie that is a child of the main-site device (revoking the parent revokes it).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { audit } from './device-trust';

export const HANDOFF_TTL_MS = 60_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Cloudflare edge ranges (https://www.cloudflare.com/ips/). Only from these do we trust CF-Connecting-IP. */
const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

function v4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}
function v6ToBig(ip: string): bigint | null {
  if (!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return null;
  const [head, tail] = ip.split('::');
  if (ip.split('::').length > 2) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  if (fill < 0 || (tail === undefined && h.length !== 8)) return null;
  const parts = [...h, ...Array(fill).fill('0'), ...t];
  let v = BigInt(0);
  for (const p of parts) { if (p.length > 4) return null; v = (v << BigInt(16)) + BigInt(parseInt(p || '0', 16)); }
  return v;
}
function inCidrs(ip: string, cidrs: string[]): boolean {
  const a4 = v4ToInt(ip);
  if (a4 !== null) {
    return cidrs.some((c) => { const [b, l] = c.split('/'); const bi = v4ToInt(b); if (bi === null) return false; const n = Number(l); const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0; return ((a4 & mask) >>> 0) === ((bi & mask) >>> 0); });
  }
  const a6 = v6ToBig(ip);
  if (a6 === null) return false;
  return cidrs.some((c) => { const [b, l] = c.split('/'); const bi = v6ToBig(b); if (bi === null) return false; const sh = BigInt(128 - Number(l)); return (a6 >> sh) === (bi >> sh); });
}

/** Real client IP: the platform IP, unless it is a Cloudflare edge (Ops host is CF-proxied) → CF-Connecting-IP. */
export function clientIp(h: Headers): string {
  const edge = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim();
  const cf = (h.get('cf-connecting-ip') || '').trim();
  if (cf && edge && inCidrs(edge, v4ToInt(edge) !== null ? CF_V4 : CF_V6)) return cf;
  return edge;
}
function country(h: Headers, viaCf: boolean): string {
  return ((viaCf ? h.get('cf-ipcountry') : null) || h.get('x-vercel-ip-country') || '').trim().toUpperCase().slice(0, 2);
}
/** Network, not exact address: IPv4 /24, IPv6 /48 (survives NAT/privacy-address churn, not a network change). */
export function networkPrefix(ip: string): string {
  const a4 = v4ToInt(ip);
  if (a4 !== null) return `4:${(a4 >>> 8).toString(16)}`;
  const a6 = v6ToBig(ip);
  if (a6 !== null) return `6:${(a6 >> BigInt(80)).toString(16)}`;
  return '';
}

/**
 * v2 binding (no raw IP stored): exact User-Agent + network prefix + country.
 * Verify: UA must match; if both sides are the same IP family the prefix must match; across families
 * (dual-stack browsers use IPv6 on one host, IPv4 on another) the country must match instead.
 */
export function clientFingerprint(h: Headers): string {
  const edge = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim();
  const ip = clientIp(h);
  const net = networkPrefix(ip);
  return `v2|${sha(h.get('user-agent') ?? '')}|${net ? `${net[0]}:${sha(net)}` : '-'}|${country(h, ip !== edge) || '-'}`;
}
export function fingerprintMatches(stored: string, h: Headers): boolean {
  const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const cur = clientFingerprint(h);
  if (!stored.startsWith('v2|')) return eq(stored, sha(`${h.get('user-agent') ?? ''}|${clientIp(h)}`));
  const [, ua1, n1, c1] = stored.split('|');
  const [, ua2, n2, c2] = cur.split('|');
  if (!ua1 || !eq(ua1, ua2)) return false;
  if (n1 !== '-' && n2 !== '-' && n1[0] === n2[0]) return eq(n1, n2);
  return c1 !== '-' && c1 === c2;
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
  if (!fingerprintMatches(r.client_hash, h)) { await audit(db, r.user_id, 'ops_handoff_client_mismatch', { id }); return { ok: false, reason: 'client' }; }
  const { data: dev } = await db.from('ops_trusted_devices').select('revoked_at, user_id').eq('id', r.device_id).maybeSingle();
  const d = dev as { revoked_at: string | null; user_id: string } | null;
  if (!d || d.revoked_at || d.user_id !== r.user_id) return { ok: false, reason: 'device' };
  const { data: prof } = await db.from('profiles').select('role').eq('id', r.user_id).maybeSingle();
  if ((prof as { role?: string } | null)?.role !== 'admin') return { ok: false, reason: 'role' };
  await audit(db, r.user_id, 'ops_handoff_used', { id });
  return { ok: true, userId: r.user_id, deviceId: r.device_id };
}
