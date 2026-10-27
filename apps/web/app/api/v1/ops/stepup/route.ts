import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticationOptions, backupCodesLeft, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, redeemBackupCode, resolveRp, verifyAuthentication } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { readCookie } from '@/lib/module-api/auth-signup/lib-auth-http';
import { DEVICE_COOKIE, trustedDeviceId } from '@/lib/ops/device-trust';
import { pollCrossDevice, startCrossDevice } from '@/lib/module-api/auth-signup/lib-auth-stepup-http';
import { cookieOpts, GRANT_TTL_MS, issueGrant, STEPUP_COOKIE, totpCheck, totpStatus, validPurpose, type StepUpMethod } from '@/lib/module-api/auth-signup/lib-auth-stepup';
import { createEmailCode, EMAIL_NONCE_COOKIE, verifyEmailCode } from '@/lib/security-core/email-stepup';
import { sendResendEmail } from '@/lib/module-api/notifications/lib-email-resend';
import { selectedProduct } from '@/lib/platform/authorize';
import { FRIENDLY_PURPOSE, toggleConfirmMode } from '@/lib/platform/toggle-confirm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PATH = '/api/v1/ops/stepup';
const NO_STORE = { 'Cache-Control': 'no-store' };
const purpose = z.string().refine(validPurpose);
const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('methods'), purpose: purpose.optional() }),
  z.object({ op: z.literal('start'), purpose }),
  z.object({ op: z.literal('poll'), id: z.string().uuid() }),
  z.object({ op: z.literal('passkey_challenge') }),
  z.object({ op: z.literal('passkey'), purpose, response: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('totp'), purpose, code: z.string().max(12) }),
  z.object({ op: z.literal('backup'), purpose, code: z.string().max(24) }),
  z.object({ op: z.literal('email_send'), purpose: z.literal(FRIENDLY_PURPOSE) }),
  z.object({ op: z.literal('email_verify'), purpose: z.literal(FRIENDLY_PURPOSE), code: z.string().max(6) }),
]);
const EMAIL_LIMITS: Record<string, { limit: number; windowSeconds: number }> = { email_send: { limit: 3, windowSeconds: 600 }, email_verify: { limit: 5, windowSeconds: 600 } };

/**
 * Step-up for sensitive Ops actions. Behind requireApiAdmin, so the requesting browser must already be
 * an approved Ops device. Success sets a single-use, purpose-bound, 5-minute httpOnly grant cookie.
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const uid = auth.user.id;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;
  const strict = ['totp', 'backup', 'passkey'].includes(b.op);
  const rl = await consumeRateLimit({ key: uid, namespace: strict ? 'stepup-verify' : 'stepup', limit: strict ? 10 : 120, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  // Friendly (customer) step-up only: the grant purpose ops.modules is accepted solely by the module toggle,
  // and only for a product configured as friendly. Owned products never get the email path.
  const friendly = toggleConfirmMode(selectedProduct(request)) === 'friendly';
  if (b.op === 'email_send' || b.op === 'email_verify') {
    if (!friendly) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
    const erl = await consumeRateLimit({ key: uid, namespace: `stepup-${b.op}`, ...EMAIL_LIMITS[b.op] });
    if (!erl.ok) return rateLimitResponse(erl);
  }
  const db = createAdminClient();
  const granted = async (method: StepUpMethod, p: string, extra: Record<string, unknown> = {}) => {
    const g = await issueGrant(db, uid, p, method);
    const res = NextResponse.json({ ok: true, method, ...extra }, { headers: NO_STORE });
    res.cookies.set(STEPUP_COOKIE, g, cookieOpts(Math.floor(GRANT_TTL_MS / 1000)));
    return res;
  };

  switch (b.op) {
    case 'methods': {
      const [t, left, pk] = await Promise.all([totpStatus(db, uid), backupCodesLeft(db, uid), db.from('webauthn_credentials').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('revoked_at', null)]);
      return NextResponse.json({ totp: t.enrolled, backup_left: left, passkeys: pk.count ?? 0, friendly: friendly && b.purpose === FRIENDLY_PURPOSE }, { headers: NO_STORE });
    }
    case 'email_send': {
      const to = auth.user.email;
      if (!to) return NextResponse.json({ error: 'no_email' }, { status: 409, headers: NO_STORE });
      const { code, nonce } = await createEmailCode(db, uid, b.purpose);
      const sent = await sendResendEmail({ to, subject: 'קוד אימות לשינוי מודולים', purpose: 'stepup_email', text: `קוד האימות שלך: ${code}\nהקוד תקף ל-5 דקות ולשימוש אחד בלבד. אם לא ביקשת אותו, אפשר להתעלם מההודעה.`, html: `<div dir="rtl" style="font-family:sans-serif"><p>קוד האימות שלך:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px" dir="ltr">${code}</p><p>הקוד תקף ל-5 דקות ולשימוש אחד בלבד. אם לא ביקשת אותו, אפשר להתעלם מההודעה.</p></div>` });
      if (!sent.ok) return NextResponse.json({ error: 'send_failed' }, { status: 502, headers: NO_STORE });
      const res = NextResponse.json({ ok: true, sent: true }, { headers: NO_STORE });
      res.cookies.set(EMAIL_NONCE_COOKIE, nonce, { ...cookieOpts(Math.floor(GRANT_TTL_MS / 1000)), path: PATH });
      return res;
    }
    case 'email_verify': {
      const g = await verifyEmailCode(db, uid, b.purpose, readCookie(request, EMAIL_NONCE_COOKIE), b.code.trim());
      if (!g) return NextResponse.json({ error: 'bad_code' }, { status: 401, headers: NO_STORE });
      const res = NextResponse.json({ ok: true, method: 'email_code' }, { headers: NO_STORE });
      res.cookies.set(STEPUP_COOKIE, g, cookieOpts(Math.floor(GRANT_TTL_MS / 1000)));
      res.cookies.set(EMAIL_NONCE_COOKIE, '', { ...cookieOpts(0), path: PATH });
      return res;
    }
    case 'start': {
      const devId = await trustedDeviceId(db, uid, readCookie(request, DEVICE_COOKIE));
      return startCrossDevice(request, db, { kind: 'ops', userId: uid, purpose: b.purpose, deviceId: devId, supabase: auth.supabase, approvePath: '/ops/approve' });
    }
    case 'poll':
      return pollCrossDevice(request, db, uid, b.id, auth.supabase);
    case 'passkey_challenge': {
      const rp = resolveRp(request);
      if (!rp) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const { options, secret } = await authenticationOptions(db, rp);
      const res = NextResponse.json({ options }, { headers: NO_STORE });
      res.cookies.set(CHALLENGE_COOKIE, secret, challengeCookieOpts(PATH));
      return res;
    }
    case 'passkey': {
      const rp = resolveRp(request);
      const ch = await consumeChallenge(db, readCookie(request, CHALLENGE_COOKIE), 'login');
      const v = await verifyAuthentication(db, ch && rp && ch.origin === rp.origin ? ch : null, b.response as unknown as AuthenticationResponseJSON);
      if (!v.ok || v.userId !== uid) return NextResponse.json({ error: 'reauth_failed' }, { status: 401, headers: NO_STORE });
      return granted('passkey', b.purpose);
    }
    case 'totp': {
      const r = await totpCheck(db, uid, b.code);
      if (!r.ok) return NextResponse.json({ error: r.locked ? 'locked' : 'bad_code' }, { status: r.locked ? 429 : 401, headers: NO_STORE });
      return granted('totp', b.purpose);
    }
    case 'backup': {
      const r = await redeemBackupCode(db, uid, b.code);
      if (!r.ok) return NextResponse.json({ error: r.locked ? 'locked' : 'bad_code' }, { status: r.locked ? 429 : 401, headers: NO_STORE });
      return granted('backup_code', b.purpose, { backup_left: await backupCodesLeft(db, uid) });
    }
  }
}
