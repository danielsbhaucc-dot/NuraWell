import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticationOptions, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, resolveRp, verifyAuthentication } from '@/lib/auth/passkeys';
import { readCookie } from '@/lib/auth/http';
import { cookieOpts, GRANT_TTL_MS, issueGrant, STEPUP_COOKIE } from '@/lib/auth/stepup';
import { pollCrossDevice, startCrossDevice } from '@/lib/auth/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PATH = '/api/v1/account/stepup';
const NO_STORE = { 'Cache-Control': 'no-store' };
/** End-user purposes only (Ops purposes go through /api/v1/ops/stepup behind the device gate). */
const USER_PURPOSES = ['account.security', 'consent.sign'] as const;
const purpose = z.enum(USER_PURPOSES);
const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('methods') }),
  z.object({ op: z.literal('start'), purpose }),
  z.object({ op: z.literal('poll'), id: z.string().uuid() }),
  z.object({ op: z.literal('passkey_challenge') }),
  z.object({ op: z.literal('passkey'), purpose, response: z.record(z.string(), z.unknown()) }),
]);

/** End-user step-up: Face ID here, or QR → approve on the user's own enrolled phone (desktop continues by itself). */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const uid = auth.user.id;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;
  const strict = b.op === 'passkey' || b.op === 'start';
  const rl = await consumeRateLimit({ key: uid, namespace: strict ? 'user-stepup-verify' : 'user-stepup', limit: strict ? 10 : 120, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const db = createAdminClient();
  switch (b.op) {
    case 'methods': {
      const pk = await db.from('webauthn_credentials').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('revoked_at', null);
      return NextResponse.json({ totp: false, backup_left: 0, passkeys: pk.count ?? 0 }, { headers: NO_STORE });
    }
    case 'start': {
      const pk = await db.from('webauthn_credentials').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('revoked_at', null);
      if (!pk.count) return NextResponse.json({ error: 'no_passkey' }, { status: 409, headers: NO_STORE }); // phone must hold an enrolled passkey
      return startCrossDevice(request, db, { kind: 'user', userId: uid, purpose: b.purpose, supabase: auth.supabase, approvePath: '/approve' });
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
      const g = await issueGrant(db, uid, b.purpose, 'passkey');
      const res = NextResponse.json({ ok: true, method: 'passkey' }, { headers: NO_STORE });
      res.cookies.set(STEPUP_COOKIE, g, cookieOpts(Math.floor(GRANT_TTL_MS / 1000)));
      return res;
    }
  }
}
