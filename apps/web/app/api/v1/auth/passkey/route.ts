import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticationOptions, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, resolveRp, verifyAuthentication } from '@/lib/auth/passkeys';
import { issueSessionForUser } from '@/lib/auth/issue-session';
import { clientIp, json, readBody, readCookie } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/v1/auth/passkey';
const FAIL = 'לא הצלחנו לאמת את מפתח הגישה. אפשר לנסות שוב או להיכנס עם סיסמה.';

/** Passkey sign-in. step "options" → server challenge (httpOnly cookie); step "verify" → session. */
export async function POST(req: Request): Promise<Response> {
  const rp = resolveRp(req);
  if (!rp) return json({ error: 'forbidden' }, 403);
  const rl = await consumeRateLimit({ key: clientIp(req), namespace: 'auth-passkey', limit: 30, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const body = await readBody(req);
  if (!body) return json({ error: 'bad_request' }, 400);
  const db = createAdminClient();

  if (body.step === 'options') {
    const { options, secret } = await authenticationOptions(db, rp);
    const res = json({ options });
    res.cookies.set(CHALLENGE_COOKIE, secret, challengeCookieOpts(PATH));
    return res;
  }
  if (body.step !== 'verify' || !body.response || typeof body.response !== 'object') return json({ error: 'bad_request' }, 400);

  const ch = await consumeChallenge(db, readCookie(req, CHALLENGE_COOKIE), 'login');
  const v = await verifyAuthentication(db, ch && ch.origin === rp.origin ? ch : null, body.response as AuthenticationResponseJSON);
  const done = (r: Response) => {
    (r as ReturnType<typeof json>).cookies.set(CHALLENGE_COOKIE, '', { ...challengeCookieOpts(PATH), maxAge: 0 });
    return r;
  };
  if (!v.ok) return done(json({ error: v.error === 'expired' ? 'הזמן לאימות עבר. אפשר לנסות שוב.' : FAIL }, 401));
  const s = await issueSessionForUser(db, v.userId);
  if (!s.ok) return done(json({ error: FAIL }, 401));
  return done(json({ ok: true }));
}

export function GET(): Response {
  return json({ error: 'method_not_allowed' }, 405);
}
