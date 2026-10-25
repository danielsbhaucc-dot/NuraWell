import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRp } from '@/lib/auth/passkeys';
import { cookieOpts, DEVICE_COOKIE, DEVICE_MAX_AGE_S, PENDING_COOKIE, requestForPendingCookie } from '@/lib/ops/device-trust';
import { KEY_CHALLENGE_COOKIE, keyLoginOptions, keyRegistrationOptions, listKeys, redeemKeyTap, removeKey, verifyKeyRegistration } from '@/lib/ops/security-keys';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { requireIrAdmin } from '@/lib/security/http';
import { verifyRecoveryCode } from '@/lib/security/ir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: noStore });
const chOpts = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/v1/ops/device/key', maxAge: 180 };
function cookieOf(req: Request, name: string): string | null {
  for (const p of (req.headers.get('cookie') ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return null;
}

/** List my keys. Approved device + step-up. */
export async function GET(request: Request) {
  const g = await requireIrAdmin(request, { stepUp: false });
  if (!g.ok) return g.response;
  return json({ keys: await listKeys(g.db, g.actor.userId) });
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login_options') }),
  z.object({ action: z.literal('login_verify'), response: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('register_options') }),
  z.object({ action: z.literal('register_verify'), response: z.record(z.string(), z.unknown()), label: z.string().max(60).default('') }),
  z.object({ action: z.literal('remove'), id: z.string().uuid(), code: z.string().min(8).max(24) }),
]);

export async function POST(request: Request) {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const a = p.data;
  const rp = resolveRp(request);
  if (!rp && a.action !== 'remove') return json({ error: 'מקור לא מורשה' }, 403);

  // Waiting browser (new device): tap the key to approve it. Admin session required, device gate skipped.
  if (a.action === 'login_options' || a.action === 'login_verify') {
    const auth = await requireApiAdmin(request, { skipDeviceGate: true });
    if (!auth.ok) return auth.response;
    const uid = auth.user.id;
    const rl = await consumeMultiRateLimits(uid, 'ops-key-login', [{ limit: 10, windowSeconds: 600 }]);
    if (!rl.ok) return rateLimitResponse(rl);
    const db = createAdminClient();
    const r = await requestForPendingCookie(db, uid, cookieOf(request, PENDING_COOKIE));
    if (!r || r.status !== 'pending') return json({ error: 'אין בקשת כניסה פעילה. רעננו את הדף.' }, 404);
    if (a.action === 'login_options') {
      const o = await keyLoginOptions(db, uid, rp!);
      if ('error' in o) return json({ error: 'אין מפתח אבטחה רשום. השתמשו בקוד גיבוי או באישור מטלגרם.' }, 404);
      const res = json({ options: o.options });
      res.cookies.set(KEY_CHALLENGE_COOKIE, o.secret, chOpts);
      return res;
    }
    const out = await redeemKeyTap(db, r, cookieOf(request, KEY_CHALLENGE_COOKIE), a.response as never);
    const res = out.ok ? json({ ok: true }) : json({ error: out.error }, 400);
    res.cookies.set(KEY_CHALLENGE_COOKIE, '', { ...chOpts, maxAge: 0 });
    if (out.ok) { res.cookies.set(DEVICE_COOKIE, out.cookie, cookieOpts(DEVICE_MAX_AGE_S)); res.cookies.set(PENDING_COOKIE, '', cookieOpts(0)); }
    return res;
  }

  // Managing keys: approved device + step-up (single use). register_verify is bound to the challenge that
  // register_options issued after step-up, so it doesn't consume a second one.
  const g = await requireIrAdmin(request, { stepUp: a.action !== 'register_verify' });
  if (!g.ok) return g.response;
  const rl = await consumeMultiRateLimits(g.actor.userId, `ops-key-${a.action}`, [{ limit: 10, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const { data: u } = await g.db.auth.admin.getUserById(g.actor.userId);
  const email = u.user?.email ?? 'admin';
  if (a.action === 'register_options') {
    const o = await keyRegistrationOptions(g.db, { id: g.actor.userId, email }, rp!);
    if ('error' in o) return json({ error: 'אפשר לרשום עד 5 מפתחות.' }, 409);
    const res = json({ options: o.options });
    res.cookies.set(KEY_CHALLENGE_COOKIE, o.secret, chOpts);
    return res;
  }
  if (a.action === 'register_verify') {
    const out = await verifyKeyRegistration(g.db, g.actor.userId, cookieOf(request, KEY_CHALLENGE_COOKIE), a.response as never, a.label);
    const res = out.ok ? json({ ok: true }) : json({ error: out.error }, 400);
    res.cookies.set(KEY_CHALLENGE_COOKIE, '', { ...chOpts, maxAge: 0 });
    if (out.ok) await alertOwnerSecurity(g.db, g.actor.userId, '🔐 נרשם מפתח אבטחה חדש לכניסה ל-Ops. אם זה לא אתם, נעלו את המערכת ממסך היומנים.', 'NuraWell: נרשם מפתח אבטחה חדש').catch(() => undefined);
    return res;
  }
  // remove: loosens security → recovery code too
  const v = await verifyRecoveryCode(g.db, g.actor, a.code, 'remove_security_key');
  if (!v.ok) return json({ error: v.error, code: 'recovery_code' }, v.locked ? 429 : 403);
  const ok = await removeKey(g.db, g.actor.userId, a.id);
  return ok ? json({ ok: true }) : json({ error: 'המפתח לא נמצא.' }, 404);
}
