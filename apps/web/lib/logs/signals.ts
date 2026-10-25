/**
 * Suspicious-pattern detection on admin API traffic + safe automatic responses.
 * Safe responses only: temporary (30 min) block of an offending IP on admin APIs, plus an alert to the owner
 * through the existing security path (alertOwnerSecurity → Telegram + email). Never deletes data.
 * Never blocks an IP that had a successful admin session in the last 30 days, so Daniel cannot be locked out.
 * Rows are lean: salted IP hash, path without query string, country code — no bodies, no raw IP.
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DENIAL_WINDOW_MS = 15 * 60_000;
export const DENIAL_THRESHOLD = 20;
export const BLOCK_MS = 30 * 60_000;
export const BULK_WINDOW_MS = 5 * 60_000;
export const BULK_THRESHOLD = 400;
export const TRUSTED_WINDOW_MS = 30 * 86_400_000;

export function requestIp(request: Request): string {
  return (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim().slice(0, 64);
}
export function requestCountry(request: Request): string | null {
  const c = (request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}
export function hashIp(ip: string): string | null {
  if (!ip) return null;
  const key = process.env.LOG_IP_HASH_KEY || process.env.CRON_SECRET || 'nw-log-ip';
  return createHmac('sha256', key).update(`ip:${ip}`).digest('hex').slice(0, 32);
}
export function safePath(request: Request): string {
  try { return new URL(request.url).pathname.slice(0, 200); } catch { return 'unknown'; }
}

/** Pure decision helpers (unit-tested). */
export function shouldBlock(denials: number, trusted: boolean): boolean {
  return !trusted && denials >= DENIAL_THRESHOLD;
}
export function isNewPlace(prevIpSeen: boolean, anyPrior: boolean): boolean {
  return anyPrior && !prevIpSeen;
}

const blockCache = new Map<string, { until: number; checked: number }>();

export async function isIpBlocked(db: SupabaseClient, ipHash: string | null, now = Date.now()): Promise<boolean> {
  if (!ipHash) return false;
  const c = blockCache.get(ipHash);
  if (c && now - c.checked < 30_000) return c.until > now;
  const { data } = await db.from('ip_blocks').select('blocked_until').eq('ip_hash', ipHash).maybeSingle();
  const until = Date.parse((data as { blocked_until?: string } | null)?.blocked_until ?? '') || 0;
  blockCache.set(ipHash, { until, checked: now });
  return until > now;
}

const rangeCache = new Map<string, { hit: boolean; checked: number }>();
/** Manual CIDR range blocks (ip_block_ranges), 30s cache per IP. */
export async function isIpRangeBlocked(db: SupabaseClient, ip: string, now = Date.now()): Promise<boolean> {
  const { isIP } = await import('node:net');
  if (!ip || !isIP(ip)) return false;
  const c = rangeCache.get(ip);
  if (c && now - c.checked < 30_000) return c.hit;
  const { data } = await db.rpc('ops_ip_in_blocked_range', { p_ip: ip });
  const hit = data === true;
  if (rangeCache.size > 2000) rangeCache.clear();
  rangeCache.set(ip, { hit, checked: now });
  return hit;
}

type AlertExtras = { buttons?: import('@/lib/ceo/channel').CeoButton[][]; emailLink?: { href: string; label: string } };
async function alertOnce(db: SupabaseClient, key: string, kind: string, detail: Record<string, unknown>, text: string, subject: string, withinMs = 3_600_000, extras: AlertExtras | (() => Promise<AlertExtras>) = {}): Promise<void> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data: prev } = await db.from('ops_security_events').select('id').eq('kind', kind).gte('created_at', since).contains('detail', { key }).limit(1);
  if (prev?.length) return;
  await db.from('ops_security_events').insert({ kind, detail: { key, ...detail }, alerted_at: new Date().toISOString() });
  const { alertOwnerSecurity } = await import('@/lib/ops/device-notify');
  const x = typeof extras === 'function' ? await extras().catch(() => ({})) : extras;
  // null user = system alert → Telegram + every admin owner's email (before 2026-10 the email leg was skipped)
  await alertOwnerSecurity(db, null, text, subject, { ...x, purpose: `security_${kind}` }).catch(() => undefined);
}

/** Deep link to the investigation view (email only; Telegram never shows the Ops address). */
export function investigateLink(params: Record<string, string>): string {
  const base = (process.env.CEO_OPS_BASE_URL || process.env.NEXT_PUBLIC_OPS_URL || 'https://ops.nurawell.ai').trim().replace(/\/$/, '');
  const q = new URLSearchParams({ tab: 'security', ...params });
  return `${base.startsWith('http') ? base : `https://${base}`}/legal?${q.toString()}`;
}

async function trustedIp(db: SupabaseClient, ipHash: string): Promise<boolean> {
  const { count } = await db.from('security_signals').select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).eq('kind', 'admin_ok').gte('created_at', new Date(Date.now() - TRUSTED_WINDOW_MS).toISOString());
  return (count ?? 0) > 0;
}

/** Called on every 401/403 from the admin guard. Best-effort; never throws. */
export async function recordAdminDenial(db: SupabaseClient, request: Request, status: number, actorId: string | null): Promise<void> {
  try {
    const ipHash = hashIp(requestIp(request));
    await db.from('security_signals').insert({ kind: status === 401 ? 'admin_401' : 'admin_403', ip_hash: ipHash, actor_id: actorId, path: safePath(request), country: requestCountry(request) });
    if (!ipHash) return;
    const { count } = await db.from('security_signals').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).in('kind', ['admin_401', 'admin_403']).gte('created_at', new Date(Date.now() - DENIAL_WINDOW_MS).toISOString());
    const n = count ?? 0;
    if (n < DENIAL_THRESHOLD) return;
    if (!shouldBlock(n, await trustedIp(db, ipHash))) return;
    const until = new Date(Date.now() + BLOCK_MS).toISOString();
    await db.from('ip_blocks').upsert({ ip_hash: ipHash, created_at: new Date().toISOString(), blocked_until: until, reason: 'admin_denials_spike' });
    blockCache.delete(ipHash);
    await alertOnce(db, `block:${ipHash}`, 'auto_block', { denials: n, country: requestCountry(request) },
      `🛡️ חסימה אוטומטית זמנית\n${n} ניסיונות גישה לא מורשים לממשק הניהול ב-15 דקות מאותה כתובת${requestCountry(request) ? ` (${requestCountry(request)})` : ''}.\nהכתובת חסומה ל-30 דקות ואז משתחררת לבד. אף מידע לא נמחק.\nכתובת שממנה נכנסת בהצלחה בחודש האחרון אף פעם לא נחסמת.`,
      'חסימה אוטומטית זמנית בממשק הניהול');
  } catch {
    /* best-effort */
  }
}

/** Called after a successful admin check. Detects new IP/country and bulk reads. Best-effort; never throws. */
const okSeen = new Map<string, number>();
export async function recordAdminSuccess(db: SupabaseClient, request: Request, actorId: string, sessionId: string | null = null): Promise<void> {
  try {
    const ipHash = hashIp(requestIp(request));
    const country = requestCountry(request);
    const now = Date.now();
    if (ipHash && (okSeen.get(ipHash) ?? 0) < now - 6 * 3_600_000) {
      okSeen.set(ipHash, now);
      const since = new Date(now - 90 * 86_400_000).toISOString();
      const { count: seen } = await db.from('security_signals').select('id', { count: 'exact', head: true }).eq('kind', 'admin_ok').eq('ip_hash', ipHash).gte('created_at', since);
      const { data: prior } = await db.from('security_signals').select('country').eq('kind', 'admin_ok').gte('created_at', since).limit(200);
      await db.from('security_signals').insert({ kind: 'admin_ok', ip_hash: ipHash, actor_id: actorId, path: safePath(request), country });
      const priorRows = (prior ?? []) as { country: string | null }[];
      const { data: known } = await db.from('ops_known_places').select('ip_hash').eq('ip_hash', ipHash).maybeSingle();
      if (!known && isNewPlace((seen ?? 0) > 0, priorRows.length > 0)) {
        const newCountry = !!country && !priorRows.some((r) => r.country === country);
        const link = investigateLink(sessionId ? { investigate: 'session', id: sessionId } : { investigate: 'iphash', id: ipHash });
        await alertOnce(db, `newip:${ipHash}`, 'admin_new_ip', { country, new_country: newCountry, session: sessionId },
          `🔐 כניסה לממשק הניהול מ${newCountry ? `מדינה חדשה (${country})` : 'כתובת רשת חדשה'}.\nזה אתה? לחץ "זה אני" ולא אתריע שוב על הכתובת הזו.\nלא אתה? לחץ "זה לא אני": אנתק את החיבור, אחסום את הכתובת ל-24 שעות ואפתח אירוע לחקירה במסך היומנים ב-Ops.\nהכפתורים תקפים 30 דקות ופועלים פעם אחת.`,
          'כניסה לממשק הניהול ממקום חדש', 7 * 86_400_000,
          async () => {
            const { createAlertButtons } = await import('@/lib/security/tg-actions');
            const buttons = await createAlertButtons(db, { userId: actorId, sessionId, ipHash, country });
            return { buttons, emailLink: { href: link, label: 'פתח את החקירה "איך הוא נכנס"' } };
          });
      }
    }
    const { count } = await db.from('admin_audit_log').select('id', { count: 'exact', head: true })
      .eq('actor_id', actorId).neq('method', 'SECURITY').gte('created_at', new Date(now - BULK_WINDOW_MS).toISOString());
    if ((count ?? 0) >= BULK_THRESHOLD) {
      await db.from('security_signals').insert({ kind: 'bulk_read', ip_hash: ipHash, actor_id: actorId, path: safePath(request), country, n: count ?? 0 });
      await alertOnce(db, `bulk:${actorId}`, 'bulk_read', { requests: count },
        `📥 קריאה חריגה של מידע מממשק הניהול: ${count} בקשות ב-5 דקות מאותו חשבון מנהל.\nאם זה לא אתה, נתק את כל החיבורים ב-Ops והחלף סיסמה. לא בוצעה חסימה כדי לא לנעול אותך בחוץ.`,
        'קריאה חריגה של מידע בממשק הניהול');
    }
  } catch {
    /* best-effort */
  }
}

/** Bulk export guard used by CSV export. */
export async function recordBulkExport(db: SupabaseClient, request: Request, actorId: string, rows: number): Promise<void> {
  if (rows < 5000) return;
  await alertOnce(db, `export:${actorId}`, 'bulk_read', { export_rows: rows },
    `📥 יוצאו ${rows} שורות יומן לקובץ CSV מממשק הניהול. אם זה לא אתה, נתק את כל החיבורים ב-Ops.`, 'ייצוא גדול של יומנים').catch(() => undefined);
  void request;
}
