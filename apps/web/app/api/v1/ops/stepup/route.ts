import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticationOptions, backupCodesLeft, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, redeemBackupCode, resolveRp, verifyAuthentication } from '@/lib/auth/passkeys';
import { readCookie } from '@/lib/auth/http';
import { DEVICE_COOKIE, deviceLabel, trustedDeviceId } from '@/lib/ops/device-trust';
import { cookieOpts, createRequest, GRANT_TTL_MS, issueGrant, pollRequest, REQUEST_TTL_MS, STEPUP_COOKIE, STEPUP_REQ_COOKIE, totpCheck, totpStatus, validPurpose, type StepUpMethod } from '@/lib/auth/stepup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PATH = '/api/v1/ops/stepup';
const NO_STORE = { 'Cache-Control': 'no-store' };
const purpose = z.string().refine(validPurpose);
const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('methods') }),
  z.object({ op: z.literal('start'), purpose }),
  z.object({ op: z.literal('poll'), id: z.string().uuid() }),
  z.object({ op: z.literal('passkey_challenge') }),
  z.object({ op: z.literal('passkey'), purpose, response: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('totp'), purpose, code: z.string().max(12) }),
  z.object({ op: z.literal('backup'), purpose, code: z.string().max(24) }),
]);

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
      return NextResponse.json({ totp: t.enrolled, backup_left: left, passkeys: pk.count ?? 0 }, { headers: NO_STORE });
    }
    case 'start': {
      const devId = await trustedDeviceId(db, uid, readCookie(request, DEVICE_COOKIE));
      const r = await createRequest(db, { userId: uid, purpose: b.purpose, deviceId: devId, label: deviceLabel(request.headers.get('user-agent')) });
      const origin = new URL(request.url).origin;
      const res = NextResponse.json({ id: r.id, expires_at: r.expiresAt, url: `${origin}/ops/approve/${r.id}#t=${r.approveToken}` }, { headers: NO_STORE });
      res.cookies.set(STEPUP_REQ_COOKIE, r.binding, cookieOpts(Math.floor(REQUEST_TTL_MS / 1000) + 30));
      return res;
    }
    case 'poll': {
      const r = await pollRequest(db, uid, b.id, readCookie(request, STEPUP_REQ_COOKIE));
      if (r.status !== 'approved') return NextResponse.json({ status: r.status }, { headers: NO_STORE });
      const res = NextResponse.json({ status: 'approved', ok: true }, { headers: NO_STORE });
      res.cookies.set(STEPUP_COOKIE, r.grant, cookieOpts(Math.floor(GRANT_TTL_MS / 1000)));
      res.cookies.set(STEPUP_REQ_COOKIE, '', cookieOpts(0));
      return res;
    }
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
