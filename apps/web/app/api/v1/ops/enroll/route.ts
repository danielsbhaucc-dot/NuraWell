import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { consumeMultiRateLimits } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRp } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { cookieOpts, DEVICE_COOKIE, DEVICE_MAX_AGE_S, deviceLabel, approxLocation } from '@/lib/ops/device-trust';
import { clientIp, country, ipHash, ipHashCandidates, maskIp } from '@/lib/platform/access/request-facts';
import { enrollStage } from '@platform/access';
import {
  ENROLL_COOKIE, completeFactor, factorPasskeyOptions, finishEnrollment, ipBlocked, loadByCookie, openEnrollment, registrationOptions, stateOf,
} from '@/lib/ops/enrollment';
import { sendOwnerTelegram } from '@/lib/ops/enroll-telegram';
import { createTelegramChannel } from '@/lib/module-api/gideon/lib-ceo-telegram';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: noStore });
/** Anything wrong before the enrollment is bound to this browser: plain 404, no hint. */
const nf = () => new NextResponse('Not Found', { status: 404, headers: noStore });
const ENR_CH = 'nw_ops_enr_ch';
const chOpts = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/v1/ops/enroll', maxAge: 180 };
const enrOpts = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/', maxAge: 15 * 60 };
function cookieOf(req: Request, name: string): string | null {
  for (const p of (req.headers.get('cookie') ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return null;
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), token: z.string().max(64) }),
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('factor_options') }),
  z.object({ action: z.literal('factor'), email: z.string().email().max(200), password: z.string().min(1).max(200),
    method: z.enum(['backup', 'passkey']), code: z.string().max(24).optional(), response: z.record(z.string(), z.unknown()).optional() }),
  z.object({ action: z.literal('register_options') }),
  z.object({ action: z.literal('register'), response: z.record(z.string(), z.unknown()) }),
]);

export async function POST(request: Request) {
  const h = request.headers;
  const ip = clientIp(h);
  const ih = ipHash(ip) || null;
  const rl = await consumeMultiRateLimits(ih ?? 'noip', 'ops-enroll', [{ limit: 30, windowSeconds: 600 }, { limit: 100, windowSeconds: 86_400 }]);
  if (!rl.ok) return nf();
  const db = createAdminClient();
  if (await ipBlocked(db, ipHashCandidates(ip))) return nf();
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return nf();
  const a = p.data;

  if (a.action === 'open') {
    const r = await openEnrollment(db, a.token, { ipHash: ih, label: deviceLabel(h.get('user-agent')), location: approxLocation(h) });
    if (!r.ok) return nf();
    const res = json({ ok: true });
    res.cookies.set(ENROLL_COOKIE, r.cookie, enrOpts);
    return res;
  }

  const row = await loadByCookie(db, cookieOf(request, ENROLL_COOKIE));
  if (!row) return nf();
  const stage = enrollStage(stateOf(row), Date.now());
  const rp = resolveRp(request);

  if (a.action === 'status') return json({ stage });

  if (a.action === 'factor_options') {
    if (stage !== 'opened' || !rp) return json({ error: 'לא זמין כרגע' }, 409);
    const o = await factorPasskeyOptions(db, row, rp);
    if (!o) return json({ error: 'אין מפתח או מכשיר רשום. השתמשו בקוד גיבוי.' }, 404);
    const res = json({ options: o.options });
    res.cookies.set(ENR_CH, o.secret, chOpts);
    return res;
  }

  if (a.action === 'factor') {
    const frl = await consumeMultiRateLimits(row.id, 'ops-enroll-factor', [{ limit: 5, windowSeconds: 1800 }]);
    if (!frl.ok) return json({ error: 'יותר מדי ניסיונות. בקשו קישור חדש.' }, 429);
    const factor = a.method === 'backup'
      ? { method: 'backup' as const, code: a.code ?? '' }
      : { method: 'passkey' as const, challengeCookie: cookieOf(request, ENR_CH), response: (a.response ?? {}) as unknown as AuthenticationResponseJSON };
    const r = await completeFactor(db, row, { email: a.email, password: a.password, factor });
    if (!r.ok) {
      if (r.error === 'stage') return json({ error: 'השלב הזה כבר הסתיים או פג.' }, 409);
      return json({ error: 'הפרטים לא אומתו.' }, 401); // same message for password / factor
    }
    const sent = await sendOwnerTelegram(createTelegramChannel(),
      `📱 מכשיר חדש: ${row.label || deviceLabel(h.get('user-agent'))}, ${row.location || approxLocation(h)}.\nזה אתם? לחצו על המספר שמוצג במסך (תוקף 2 דקות).`,
      [r.options.map((n) => ({ text: String(n), data: `ceo:em:${row.id}:${n}` }))]);
    if (!sent) return json({ error: 'לא הצלחתי לשלוח אישור לטלגרם. נסו שוב מאוחר יותר.' }, 503);
    const res = json({ number: r.number });
    res.cookies.set(ENR_CH, '', { ...chOpts, maxAge: 0 });
    return res;
  }

  if (a.action === 'register_options') {
    if (stage !== 'approved' || !rp) return json({ error: 'עדיין לא אושר' }, 409);
    const { data } = await db.auth.admin.getUserById(row.user_id);
    const o = await registrationOptions(db, row, data.user?.email ?? 'admin', rp);
    if (!o) return json({ error: 'עדיין לא אושר' }, 409);
    const res = json({ options: o.options });
    res.cookies.set(ENR_CH, o.secret, chOpts);
    return res;
  }

  // register
  const r = await finishEnrollment(db, row, cookieOf(request, ENR_CH), a.response as unknown as RegistrationResponseJSON,
    { ua: h.get('user-agent'), ipHash: ih, ipMasked: maskIp(ip), country: country(h) });
  if (!r.ok) return json({ error: 'רישום הפאסקי נכשל. בקשו קישור חדש.' }, 400);
  await alertOwnerSecurity(db, row.user_id, `✅ מכשיר חדש נרשם לניהול: ${row.label} · ${row.location}.\nאם זה לא אתם — בטלו מיד.`, 'מכשיר חדש נרשם',
    { buttons: [[{ text: '🗑️ בטלו את המכשיר', data: `ceo:dr:${r.deviceId}` }]] }).catch(() => undefined);
  const res = json({ ok: true });
  res.cookies.set(DEVICE_COOKIE, r.deviceCookie, cookieOpts(DEVICE_MAX_AGE_S));
  res.cookies.set(ENROLL_COOKIE, '', { ...enrOpts, maxAge: 0 });
  res.cookies.set(ENR_CH, '', { ...chOpts, maxAge: 0 });
  return res;
}
