import { NextResponse } from 'next/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { checkPasswordPolicy } from '@/lib/auth/password-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

/**
 * Dry-run password policy check (no user is created). POST JSON body only;
 * the password is never read from the URL, never logged, never echoed back.
 */
export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  const rl = await consumeRateLimit({ key: ip, namespace: 'auth-password-check', limit: 20, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  if (new URL(req.url).searchParams.has('password')) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown })?.password;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  const r = await checkPasswordPolicy(password, { source: 'password-check' });
  const body = r.ok ? { ok: true } : { ok: false, reason: r.reason, error: r.error };
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}

export function GET(): Response {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
