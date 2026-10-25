import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  approxLocation, consumeApproved, cookieOpts, decideRequest, DEVICE_COOKIE, DEVICE_MAX_AGE_S, deviceLabel, listDevices,
  openRequestsFor, PENDING_COOKIE, redeemEmailCode, redeemRecoveryCode, regenerateRecoveryCodes, requestForPendingCookie,
  revokeDevice, startLoginRequest, unusedCodeCount,
} from '@/lib/ops/device-trust';
import { alertOwnerSecurity, sendLoginEmail, sendTelegramLoginCard } from '@/lib/ops/device-notify';
import { killSwitch } from '@/lib/ceo/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

function cookieOf(req: Request, name: string): string | null {
  for (const p of (req.headers.get('cookie') ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return null;
}
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: noStore });

/** GET ?view=status (pending browser) | pending | devices (trusted only) */
export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get('view') ?? 'status';
  const trustedOnly = view !== 'status';
  const auth = await requireApiAdmin(request, { skipDeviceGate: !trustedOnly });
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const uid = auth.user.id;
  if (view === 'pending') return json({ requests: await openRequestsFor(db, uid) });
  if (view === 'devices') {
    const { data: st } = await db.from('ops_security_state').select('codes_pending_display').eq('user_id', uid).maybeSingle();
    return json({ devices: await listDevices(db, uid), unusedCodes: await unusedCodeCount(db, uid), showCodesBanner: Boolean((st as { codes_pending_display?: boolean } | null)?.codes_pending_display) });
  }
  const r = await requestForPendingCookie(db, uid, cookieOf(request, PENDING_COOKIE));
  if (!r) return json({ status: 'none' });
  if (r.status === 'approved') {
    const cookie = await consumeApproved(db, r);
    if (!cookie) return json({ status: 'none' });
    const res = json({ status: 'approved' });
    res.cookies.set(DEVICE_COOKIE, cookie, cookieOpts(DEVICE_MAX_AGE_S));
    res.cookies.set(PENDING_COOKIE, '', cookieOpts(0));
    return res;
  }
  return json({ status: r.status, expiresAt: r.expires_at });
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('email') }),
  z.object({ action: z.literal('email_code'), code: z.string().max(12) }),
  z.object({ action: z.literal('recovery'), code: z.string().max(20) }),
  z.object({ action: z.literal('deny_self') }),
  z.object({ action: z.literal('decide'), id: z.string().uuid(), approve: z.boolean() }),
  z.object({ action: z.literal('revoke'), id: z.string().uuid() }),
  z.object({ action: z.literal('regenerate_codes') }),
]);
const PENDING_ACTIONS = new Set(['start', 'email', 'email_code', 'recovery', 'deny_self']);

export async function POST(request: Request) {
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const a = p.data;
  const auth = await requireApiAdmin(request, { skipDeviceGate: PENDING_ACTIONS.has(a.action) });
  if (!auth.ok) return auth.response;
  const uid = auth.user.id;
  const rl = await consumeMultiRateLimits(uid, `ops-device-${a.action}`, [{ limit: a.action === 'start' || a.action === 'email' ? 5 : 10, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const db = createAdminClient();

  if (a.action === 'start') {
    const label = deviceLabel(request.headers.get('user-agent'));
    const location = approxLocation(request.headers);
    const r = await startLoginRequest(db, uid, label, location);
    await sendTelegramLoginCard(db, { id: r.id, user_id: uid, label, location, created_at: new Date().toISOString() });
    const res = json({ ok: true, expiresAt: r.expiresAt });
    res.cookies.set(PENDING_COOKIE, r.pendingCookie, cookieOpts(15 * 60));
    return res;
  }
  if (a.action === 'deny_self') {
    // "זה לא אני" from the waiting browser: only ever reduces access (deny request + revoke all sessions + kill switch).
    const r = await requestForPendingCookie(db, uid, cookieOf(request, PENDING_COOKIE));
    if (r && r.status === 'pending') await decideRequest(db, r.id, false, `self_deny:${uid}`);
    else await db.rpc('ops_revoke_user_sessions', { p_user: uid });
    await killSwitch(db, `ops:${uid}`, 'ops login denied from waiting page').catch(() => undefined);
    const res = json({ ok: true });
    res.cookies.set(PENDING_COOKIE, '', cookieOpts(0));
    return res;
  }
  if (a.action === 'email' || a.action === 'email_code' || a.action === 'recovery') {
    const r = await requestForPendingCookie(db, uid, cookieOf(request, PENDING_COOKIE));
    if (!r) return json({ error: 'אין בקשת כניסה פעילה. רענן את הדף.' }, 404);
    if (a.action === 'email') return json({ ok: await sendLoginEmail(db, r) });
    const out = a.action === 'recovery' ? await redeemRecoveryCode(db, r, a.code) : await redeemEmailCode(db, r.id, a.code);
    if (!out.ok) return json({ error: out.error, locked: out.locked ?? false }, out.locked ? 429 : 400);
    if (a.action === 'recovery') await alertOwnerSecurity(db, uid, `🔑 נעשה שימוש בקוד גיבוי כדי לאשר מכשיר חדש ל-Ops (${deviceLabel(request.headers.get('user-agent'))}). אם זה לא אתם, נעלו את המערכת ממסך היומנים.`, 'NuraWell: נעשה שימוש בקוד גיבוי').catch(() => undefined);
    const res = json({ ok: true });
    res.cookies.set(DEVICE_COOKIE, out.cookie, cookieOpts(DEVICE_MAX_AGE_S));
    res.cookies.set(PENDING_COOKIE, '', cookieOpts(0));
    return res;
  }
  if (a.action === 'decide') {
    const d = await decideRequest(db, a.id, a.approve, `ops_trusted:${uid}`);
    if (!d) return json({ error: 'הבקשה פגה או כבר טופלה.' }, 409);
    if (!a.approve) await killSwitch(db, `ops:${uid}`, 'ops login denied in Ops').catch(() => undefined);
    return json({ ok: true });
  }
  if (a.action === 'revoke') return json({ ok: await revokeDevice(db, uid, a.id, `ops:${uid}`) });
  // regenerate_codes: shown once
  return json({ codes: await regenerateRecoveryCodes(db, uid, `ops:${uid}`) });
}
