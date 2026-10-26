import 'server-only';
import { createHmac } from 'node:crypto';

/** Pseudonymous request facts for access logs: keyed IP hash (never the raw IP), 2-letter country, masked IP for display. */
// Dual-key: WRITE with the current key; VERIFY (lookups) against current + previous, so ACCESS_LOG_HASH_KEY can be
// introduced/rotated without un-blocking IPs. Previous = ACCESS_LOG_HASH_KEY_PREV, else (when a dedicated key is set)
// the legacy fallback chain that produced every hash stored so far. Unset ACCESS_LOG_HASH_KEY = identical to before.
function legacyKey(): string {
  return process.env.OPS_DEVICE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'dev-only';
}
function key(): string {
  return process.env.ACCESS_LOG_HASH_KEY?.trim() || legacyKey();
}
function prevKey(): string {
  const cur = process.env.ACCESS_LOG_HASH_KEY?.trim();
  return process.env.ACCESS_LOG_HASH_KEY_PREV?.trim() || (cur ? legacyKey() : '');
}
const hmac = (k: string, ip: string) => createHmac('sha256', k).update(`ip:${ip}`).digest('base64url').slice(0, 32);
export function clientIp(h: Headers): string {
  return (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || '').trim();
}
export function ipHash(ip: string): string {
  return ip ? hmac(key(), ip) : '';
}
/** Every hash an already-stored row may carry for this IP (current first). Use for lookups, never for writes. */
export function ipHashCandidates(ip: string): string[] {
  if (!ip) return [];
  const p = prevKey();
  const out = [hmac(key(), ip)];
  if (p && p !== key()) out.push(hmac(p, ip));
  return out;
}
export function maskIp(ip: string): string {
  if (!ip) return '';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':…';
  const p = ip.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.x.x` : '';
}
export function country(h: Headers): string {
  const c = (h.get('x-vercel-ip-country') || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : '';
}
export function city(h: Headers): string {
  try { return decodeURIComponent(h.get('x-vercel-ip-city') || '').slice(0, 40); } catch { return ''; }
}
export function requestFacts(h: Headers) {
  const ip = clientIp(h);
  return { ipHash: ipHash(ip) || null, country: country(h) || null };
}
