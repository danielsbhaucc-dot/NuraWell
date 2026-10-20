import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueSessionForUser } from '@/lib/auth/issue-session';
import { clientIp, readCookie } from '@/lib/auth/http';
import { cookieOpts, pollRequest, STEPUP_REQ_COOKIE } from '@/lib/auth/stepup';
import { startCrossDevice } from '@/lib/auth/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = z.discriminatedUnion('op', [z.object({ op: z.literal('start') }), z.object({ op: z.literal('poll'), id: z.string().uuid() })]);

/**
 * Sign in on this screen by approving on a phone that is already signed in with a passkey.
 * The phone shows this browser, city and time and asks for the 2-digit number shown here. Bound to this
 * browser (httpOnly cookie), single use, 2 minutes. The session is minted only on this request, server-side.
 * Ops device approval still applies after sign-in (proxy).
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;
  const ip = clientIp(request);
  const rl = b.op === 'start'
    ? await consumeRateLimit({ key: ip, namespace: 'auth-qr-start', limit: 10, windowSeconds: 600 })
    : await consumeRateLimit({ key: ip, namespace: 'auth-qr-poll', limit: 200, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const db = createAdminClient();
  if (b.op === 'start') return startCrossDevice(request, db, { kind: 'login', userId: null, purpose: 'auth.login', supabase: null, approvePath: '/approve' });
  const r = await pollRequest(db, null, b.id, readCookie(request, STEPUP_REQ_COOKIE));
  if (r.status !== 'approved' || !r.userId) return NextResponse.json({ status: r.status === 'approved' ? 'consumed' : r.status }, { headers: NO_STORE });
  const s = await issueSessionForUser(db, r.userId);
  if (!s.ok) return NextResponse.json({ status: 'denied' }, { headers: NO_STORE });
  await db.from('admin_audit_log').insert({ actor_id: r.userId, method: 'SECURITY', path: 'login_qr', detail: { request: b.id } }).then(() => undefined, () => undefined);
  const res = NextResponse.json({ status: 'approved', ok: true }, { headers: NO_STORE });
  res.cookies.set(STEPUP_REQ_COOKIE, '', cookieOpts(0));
  return res;
}
