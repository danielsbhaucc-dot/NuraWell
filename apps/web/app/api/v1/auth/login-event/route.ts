import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashIp, requestCountry, requestIp } from '@/lib/logs/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Login outcome beacon from the sign-in page (password login runs in the browser, so the server would
 * otherwise never see failures). Stores only a salted IP hash, country and outcome; never the email or password.
 * A success is recorded only when a real session cookie is present (cannot be forged for another account).
 * Feeds "ניסיונות כושלים לפני הצלחה" in the investigation view. Always answers 204.
 */
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const ip = requestIp(request);
    const rl = await consumeRateLimit({ key: ip || 'none', namespace: 'auth-login-event', limit: 30, windowSeconds: 900 });
    if (!rl.ok) return done;
    const body = (await request.json().catch(() => ({}))) as { ok?: unknown };
    const db = createAdminClient();
    let actor: string | null = null;
    if (body.ok === true) {
      const { data } = await (await createClient()).auth.getUser();
      actor = data.user?.id ?? null;
      if (!actor) return done;
    }
    await db.from('security_signals').insert({ kind: actor ? 'login_ok' : 'login_fail', ip_hash: hashIp(ip), actor_id: actor, path: '/login', country: requestCountry(request) });
  } catch { /* best-effort */ }
  return done;
}
