import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { isPwnedPassword } from '@/lib/auth/password-policy';
import { reportEvent } from '@/lib/monitoring/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

/**
 * S5: leaked-password check right after a successful password sign-in.
 * Only answers for a real session (so it cannot be used as an anonymous HIBP oracle), rate-limited per user.
 * k-anonymity via the security-privacy kit: only 5 hex chars of the SHA-1 leave the server.
 * The password is never logged, stored or echoed. Fails open ({ pwned: null }) when HIBP is unavailable.
 */
export async function POST(req: Request): Promise<Response> {
  const { data } = await (await createClient()).auth.getUser();
  const uid = data.user?.id;
  if (!uid) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const rl = await consumeRateLimit({ key: uid, namespace: 'auth-signin-password-check', limit: 5, windowSeconds: 3600 });
  if (!rl.ok) return NextResponse.json({ ok: true, pwned: null }, { status: 200, headers: NO_STORE });
  if (new URL(req.url).searchParams.has('password')) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400, headers: NO_STORE });
  let password: unknown;
  try { password = ((await req.json()) as { password?: unknown })?.password; } catch { password = null; }
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  const pwned = await isPwnedPassword(password);
  if (pwned) void reportEvent('password_pwned_signin', { source: 'login' }, 'warning').catch(() => undefined);
  return NextResponse.json({ ok: true, pwned }, { status: 200, headers: NO_STORE });
}

export function GET(): Response {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
