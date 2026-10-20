import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotDemoAccessSession } from '@/lib/demo-access/server';
import { DEVICE_COOKIE, trustedDeviceId } from '@/lib/ops/device-trust';
import {
  backupCodesLeft,
  CHALLENGE_COOKIE,
  challengeCookieOpts,
  consumeChallenge,
  isFreshSession,
  listPasskeys,
  passkeyLabel,
  regenerateBackupCodes,
  registrationOptions,
  resolveRp,
  revokePasskey,
  verifyRegistration,
} from '@/lib/auth/passkeys';
import { json, readBody, readCookie } from '@/lib/auth/http';
import { consumeGrant, peekGrant, STEPUP_COOKIE } from '@/lib/auth/stepup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/v1/account/security';

async function context(req: Request) {
  const auth = await requireApiSession(req);
  if (!auth.ok) return { ok: false as const, fail: auth.response };
  const db = createAdminClient();
  const { data: prof } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  const isAdmin = (prof as { role?: string } | null)?.role === 'admin';
  const { data: sess } = await auth.supabase.auth.getSession();
  // fresh sign-in, OR a single-use 'account.security' step-up grant (Face ID here / QR → own phone)
  const grantCookie = readCookie(req, STEPUP_COOKIE);
  const fresh = isFreshSession(sess.session?.access_token) || (await peekGrant(db, auth.user.id, 'account.security', grantCookie));
  // Admins: sensitive changes only from an approved Ops device (never bootstrap from here).
  const opsDeviceId = isAdmin ? await trustedDeviceId(db, auth.user.id, readCookie(req, DEVICE_COOKIE)) : null;
  return { ok: true as const, auth, db, isAdmin, fresh, opsDeviceId, grantCookie };
}

export async function GET(req: Request): Promise<Response> {
  const c = await context(req);
  if (!c.ok) return c.fail;
  return json({
    passkeys: await listPasskeys(c.db, c.auth.user.id),
    backup_codes_enabled: c.isAdmin,
    backup_codes_left: c.isAdmin ? await backupCodesLeft(c.db, c.auth.user.id) : 0,
    fresh: c.fresh,
    device_ok: !c.isAdmin || Boolean(c.opsDeviceId),
  });
}

export async function POST(req: Request): Promise<Response> {
  const rp = resolveRp(req);
  if (!rp) return json({ error: 'forbidden' }, 403);
  const c = await context(req);
  if (!c.ok) return c.fail;
  const uid = c.auth.user.id;
  const demo = await assertNotDemoAccessSession(uid);
  if (!demo.ok) return json({ error: demo.message }, 403);
  const rl = await consumeMultiRateLimits(uid, 'account-security', [{ limit: 10, windowSeconds: 60 }, { limit: 40, windowSeconds: 3600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const body = await readBody(req);
  const action = body?.action;

  if (action === 'revoke') {
    const ok = await revokePasskey(c.db, uid, String(body?.id ?? ''));
    return ok ? json({ ok: true }) : json({ error: 'המפתח לא נמצא.' }, 404);
  }

  // everything below adds a way in → step-up + (admins) approved device
  if (!c.fresh) return json({ error: 'reauth', message: 'מטעמי אבטחה צריך להתחבר מחדש לפני השינוי הזה.' }, 403);
  if (c.isAdmin && !c.opsDeviceId) return json({ error: 'device', message: 'אפשר לבצע את השינוי רק ממכשיר מאושר.' }, 403);

  if (action === 'register-options') {
    const email = c.auth.user.email;
    if (!email) return json({ error: 'bad_request' }, 400);
    const r = await registrationOptions(c.db, { id: uid, email }, rp);
    if ('error' in r) return json({ error: 'הגעת למספר המרבי של מפתחות גישה.' }, 409);
    const res = json({ options: r.options });
    res.cookies.set(CHALLENGE_COOKIE, r.secret, challengeCookieOpts(PATH));
    return res;
  }
  if (action === 'register-verify') {
    if (!body?.response || typeof body.response !== 'object') return json({ error: 'bad_request' }, 400);
    const ch = await consumeChallenge(c.db, readCookie(req, CHALLENGE_COOKIE), 'register');
    const v = await verifyRegistration(c.db, uid, ch && ch.origin === rp.origin ? ch : null, body.response as RegistrationResponseJSON, {
      label: passkeyLabel(req.headers.get('user-agent')),
      opsDeviceId: c.opsDeviceId,
    });
    if (v.ok) await consumeGrant(c.db, uid, 'account.security', c.grantCookie); // single use
    const res = v.ok ? json({ ok: true }) : json({ error: v.error === 'expired' ? 'הזמן להוספה עבר. אפשר לנסות שוב.' : 'לא הצלחנו להוסיף את מפתח הגישה.' }, 400);
    res.cookies.set(CHALLENGE_COOKIE, '', { ...challengeCookieOpts(PATH), maxAge: 0 });
    return res;
  }
  if (action === 'regenerate-codes' && c.isAdmin) {
    await consumeGrant(c.db, uid, 'account.security', c.grantCookie);
    const codes = await regenerateBackupCodes(c.db, uid);
    return json({ codes });
  }
  return json({ error: 'bad_request' }, 400);
}
