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
const reply = (body: Record<string, unknown>, status = 200): Response => NextResponse.json(body, { status, headers: NO_STORE });

/** Reads `password` from the JSON body only; returns null when missing, not a string, or outside 1..128 chars. */
const readPassword = async (req: Request): Promise<string | null> => {
  if (new URL(req.url).searchParams.has('password')) return null;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = body?.password;
  return typeof password === 'string' && password.length >= 1 && password.length <= 128 ? password : null;
};

export const POST = async (req: Request): Promise<Response> => {
  const { data } = await (await createClient()).auth.getUser();
  const userId = data.user?.id;
  if (!userId) return reply({ ok: false, error: 'unauthorized' }, 401);
  const limit = await consumeRateLimit({ key: userId, namespace: 'auth-signin-password-check', limit: 5, windowSeconds: 3600 });
  if (!limit.ok) return reply({ ok: true, pwned: null });
  const password = await readPassword(req);
  if (password === null) return reply({ ok: false, error: 'bad_request' }, 400);
  const pwned = await isPwnedPassword(password);
  if (pwned) reportEvent('password_pwned_signin', { source: 'login' }, 'warning').catch(() => undefined);
  return reply({ ok: true, pwned });
};

/** Only POST is supported; the password must never travel in a URL. */
export const GET = (): Response =>
  NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
