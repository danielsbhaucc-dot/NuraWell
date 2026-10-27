import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeGrant, readCookieFrom, STEPUP_COOKIE, totpBeginEnroll, totpCheck } from '@/lib/module-api/auth-signup/lib-auth-stepup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const body = z.discriminatedUnion('op', [z.object({ op: z.literal('begin') }), z.object({ op: z.literal('confirm'), code: z.string().max(12) })]);

/** Add an authenticator app. Starting enrollment needs a step-up grant for 'ops.factor' (phone / passkey / backup code). */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeRateLimit({ key: auth.user.id, namespace: 'stepup-totp', limit: 10, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const db = createAdminClient();
  if (parsed.data.op === 'begin') {
    const g = await consumeGrant(db, auth.user.id, 'ops.factor', readCookieFrom(request, STEPUP_COOKIE));
    if (!g.ok || g.method === 'totp') return NextResponse.json({ error: 'stepup_required', purpose: 'ops.factor' }, { status: 401, headers: NO_STORE });
    const e = await totpBeginEnroll(db, auth.user.id, auth.user.email ?? 'admin');
    if (!e) return NextResponse.json({ error: 'already_enrolled' }, { status: 409, headers: NO_STORE });
    const QR = await import('qrcode').catch(() => null);
    const svg = QR ? await QR.toString(e.uri, { type: 'svg', margin: 1, color: { dark: '#0b2a25', light: '#00000000' } }) : null;
    return NextResponse.json({ secret: e.secret, uri: e.uri, qr_svg: svg }, { headers: NO_STORE });
  }
  const r = await totpCheck(db, auth.user.id, parsed.data.code, { confirm: true });
  return r.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: r.locked ? 'locked' : 'bad_code' }, { status: 401, headers: NO_STORE });
}
