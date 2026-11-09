import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { clientIp } from '@/lib/ops/handoff';
import { checkPasswordPolicy } from '@/lib/module-api/auth-signup/lib-auth-password-policy';
import { CLIENT_ID, PARENT } from '@/lib/central/parent-connect';

/**
 * NuraWell change-password. The parent identity is the source of truth: the current and the new password go once,
 * server to server, to the parent (/id/password/set, client secret), which checks the current one and changes the
 * parent hash (all parent sessions end, audited). Only after that NuraWell's own copy is updated, so the native
 * break-glass login (signin=off) keeps the same password.
 */
const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

// skipcq: JS-R1005 -- flat fail-closed guards
export async function changePassword(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) return reply(403, { error: 'origin' });
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return reply(401, { error: 'unauthenticated' });
  const rl = await consumeRateLimit({ key: user.id, namespace: 'account-password', limit: 6, windowSeconds: 600 }).catch(() => ({ ok: true as const }));
  if (!rl.ok) return reply(429, { error: 'rate_limited' });
  const b = await request.json().catch(() => null) as { current?: unknown; password?: unknown } | null;
  const current = typeof b?.current === 'string' ? b.current : '';
  const next = typeof b?.password === 'string' ? b.password : '';
  if (!current || !next || current.length > 200 || next.length > 128) return reply(400, { error: 'invalid_request' });
  const policy = await checkPasswordPolicy(next, { source: 'account-change', email: user.email });
  if (!policy.ok) return reply(400, { error: 'password', message: policy.error });
  const secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
  if (secret.length < 32) return reply(503, { error: 'config' });
  const res = await fetch(`${PARENT}/id/password/set/`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: secret, email: user.email, current_password: current, new_password: next, ip: clientIp(request.headers) || 'na' }),
  }).catch(() => null);
  const pb = await res?.json().catch(() => ({})) as { error?: string; message?: string } | undefined;
  if (!res || !res.ok) {
    console.warn('[account-password]', { why: pb?.error ?? 'unavailable', status: res?.status ?? 0 });
    if (res?.status === 401) return reply(401, { error: 'credentials' });
    if (res?.status === 400 && pb?.error === 'password') return reply(400, { error: 'password', message: pb.message });
    if (res?.status === 429 || res?.status === 423) return reply(429, { error: 'rate_limited' });
    return reply(503, { error: 'unavailable' });
  }
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { password: next });
  console.info('[account-password]', { why: error ? 'parent_only' : 'changed' });
  return reply(200, { ok: true, local: !error });
}
