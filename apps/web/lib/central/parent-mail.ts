import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { sendResendEmail } from '@/lib/module-api/notifications/lib-email-resend';
import { logDelivery } from '@/lib/logging/delivery';
import { PARENT, verifyPurposeToken } from '@/lib/central/parent-connect';

/**
 * Parent reset mail delivered through NuraWell's existing transactional mail (Resend + delivery log), used while the
 * parent's own sender is not configured. The request is a parent-signed ES256 purpose token (typ id-mail+jwt,
 * 2 minutes, one use). Mail goes only to a CONFIRMED NuraWell account with exactly that address, and only with a
 * link to the parent reset page. Synthetic test accounts are never mailed (logged as suppressed).
 */
const LINK_PREFIX = `${PARENT}/account/reset/#t=`;
const linkOk = (link: string) => link.startsWith(LINK_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(link.slice(LINK_PREFIX.length));
const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

const findConfirmed = async (email: string) => {
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? '').trim().toLowerCase() === email && Boolean(u.email_confirmed_at));
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
};

const html = (link: string) => `<!doctype html><html dir="rtl" lang="he"><body dir="rtl" style="font-family:Assistant,Heebo,Arial,sans-serif;text-align:right;line-height:1.6"><p>שלום,</p><p>ביקשת לאפס את הסיסמה לחשבון המרכזי שמשמש גם לכניסה ל־NuraWell. לבחירת סיסמה חדשה אפשר לפתוח את הקישור (תקף ל־30 דקות):</p><p><a href="${link}">${link}</a></p><p>אם לא ביקשת את זה, אפשר להתעלם מההודעה.</p></body></html>`;

// skipcq: JS-R1005 -- flat fail-closed guards
export async function deliverParentMail(request: NextRequest): Promise<NextResponse> {
  const b = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof b?.token === 'string' && b.token.length < 4000 ? b.token : '';
  if (!token) return reply(400, { error: 'invalid_request' });
  const jwks = await fetch(`${PARENT}/id/jwks/`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const c = jwks ? await verifyPurposeToken(token, jwks as never, 'id-mail+jwt') : null;
  const email = typeof c?.email === 'string' ? c.email.trim().toLowerCase() : '';
  const link = typeof c?.link === 'string' ? c.link : '';
  if (!c || c.purpose !== 'reset' || !email.includes('@') || !linkOk(link)) return reply(401, { error: 'invalid_token' });
  const once = await consumeRateLimit({ key: String(c.jti), namespace: 'central-mail-jti', limit: 1, windowSeconds: 900 }).catch(() => ({ ok: false as const }));
  if (!once.ok) return reply(409, { error: 'replay' });
  const perRcpt = await consumeRateLimit({ key: email, namespace: 'central-mail-rcpt', limit: 3, windowSeconds: 3600 }).catch(() => ({ ok: false as const }));
  if (!perRcpt.ok) return reply(429, { error: 'rate_limited' });
  const user = await findConfirmed(email);
  if (!user) return reply(200, { ok: true, sent: false });
  if (user.app_metadata?.synthetic === true) {
    await logDelivery({ channel: 'email', purpose: 'parent_reset', recipient: email, ok: false, error: 'synthetic_suppressed' });
    return reply(200, { ok: true, sent: false, suppressed: true });
  }
  const r = await sendResendEmail({ to: email, subject: 'איפוס סיסמה לחשבון', html: html(link), text: `לבחירת סיסמה חדשה (תקף ל־30 דקות):\n${link}\n\nאם לא ביקשת את זה, אפשר להתעלם מההודעה.`, purpose: 'parent_reset' });
  return reply(200, { ok: true, sent: r.ok });
}
