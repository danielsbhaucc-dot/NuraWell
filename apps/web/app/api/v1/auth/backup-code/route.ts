import { createHash } from 'node:crypto';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { redeemBackupCode, resolveRp } from '@/lib/auth/passkeys';
import { issueSessionForUser } from '@/lib/auth/issue-session';
import { clientIp, json, readBody, sleepUntil } from '@/lib/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_MS = 900; // same duration for unknown email / wrong code / success
const FAIL = 'האימייל או קוד הגיבוי לא נכונים.';

/** Sign in with email + one-time backup code (when the device with the passkey is not at hand). */
export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  if (!resolveRp(req)) return json({ error: 'forbidden' }, 403);
  const ip = await consumeRateLimit({ key: clientIp(req), namespace: 'auth-backup-code-ip', limit: 10, windowSeconds: 900 });
  if (!ip.ok) return rateLimitResponse(ip);
  const body = await readBody(req, 2_000);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!email || email.length > 254 || !code || code.length > 32) return json({ error: FAIL }, 400);
  const per = await consumeRateLimit({ key: createHash('sha256').update(email).digest('hex'), namespace: 'auth-backup-code-acct', limit: 5, windowSeconds: 900 });
  if (!per.ok) return rateLimitResponse(per);

  const db = createAdminClient();
  const { data: uid } = await db.rpc('auth_user_id_by_email', { p_email: email });
  let result: Response;
  if (typeof uid !== 'string') {
    result = json({ error: FAIL }, 401);
  } else {
    const r = await redeemBackupCode(db, uid, code);
    if (!r.ok) {
      result = json({ error: r.locked ? 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד 30 דקות.' : FAIL }, r.locked ? 429 : 401);
    } else {
      const s = await issueSessionForUser(db, uid);
      result = s.ok ? json({ ok: true }) : json({ error: FAIL }, 401);
    }
  }
  await sleepUntil(started, MIN_MS);
  return result;
}

export function GET(): Response {
  return json({ error: 'method_not_allowed' }, 405);
}
