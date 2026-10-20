import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin, requireApiSession } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticationOptions, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, resolveRp, verifyAuthentication } from '@/lib/auth/passkeys';
import { readCookie } from '@/lib/auth/http';
import { deviceLabel } from '@/lib/ops/device-trust';
import { decide, describeForApprover, loadReq } from '@/lib/auth/stepup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PATH = '/api/v1/stepup/approve';
const NO_STORE = { 'Cache-Control': 'no-store' };
const t = z.string().min(20).max(100);
const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('describe'), id: z.string().uuid(), t }),
  z.object({ op: z.literal('challenge'), id: z.string().uuid() }),
  z.object({ op: z.literal('decide'), id: z.string().uuid(), t, action: z.enum(['approve', 'deny', 'report']), pick: z.string().regex(/^[0-9]{2}$/).optional(), response: z.record(z.string(), z.unknown()).optional() }),
]);

/**
 * Phone side of every QR approval (Ops step-up, user step-up, QR login).
 * Requires: signed-in approver, the QR secret, the request's own account; Ops requests also need the approved
 * Ops device (requireApiAdmin gate). Approve = fresh passkey assertion by the same user (own enrolled device)
 * + the right match number. Rate-limited, single use, everything audited.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;
  const db = createAdminClient();
  const req = await loadReq(db, b.id);
  const auth = req?.kind === 'ops' ? await requireApiAdmin(request) : await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const uid = auth.user.id;
  const rl = await consumeRateLimit({ key: uid, namespace: 'stepup-approve', limit: 30, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  if (b.op === 'describe') {
    const d = await describeForApprover(db, uid, b.id, b.t);
    return d ? NextResponse.json(d, { headers: NO_STORE }) : NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  if (b.op === 'challenge') {
    const rp = resolveRp(request);
    if (!rp) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { options, secret } = await authenticationOptions(db, rp);
    const res = NextResponse.json({ options }, { headers: NO_STORE });
    res.cookies.set(CHALLENGE_COOKIE, secret, challengeCookieOpts(PATH));
    return res;
  }
  if (b.action === 'approve') {
    if (!b.pick) return NextResponse.json({ error: 'pick_required' }, { status: 400, headers: NO_STORE });
    const rp = resolveRp(request);
    const ch = await consumeChallenge(db, readCookie(request, CHALLENGE_COOKIE), 'login');
    const v = b.response ? await verifyAuthentication(db, ch && rp && ch.origin === rp.origin ? ch : null, b.response as unknown as AuthenticationResponseJSON) : { ok: false as const };
    if (!v.ok || v.userId !== uid) return NextResponse.json({ error: 'reauth_failed' }, { status: 401, headers: NO_STORE });
  }
  const r = await decide(db, uid, b.id, b.t, b.action, deviceLabel(request.headers.get('user-agent')), b.pick);
  if (r === 'ok') return NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (r === 'wrong_number') return NextResponse.json({ error: 'wrong_number' }, { status: 409, headers: NO_STORE });
  if (r === 'reported') return NextResponse.json({ error: 'reported' }, { status: 423, headers: NO_STORE });
  return NextResponse.json({ error: 'expired' }, { status: 410, headers: NO_STORE });
}
