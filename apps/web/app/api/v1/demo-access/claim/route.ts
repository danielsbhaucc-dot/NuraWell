import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { applyDemoSessionCookies, claimDemoAccessLink } from '@/lib/demo-access/claim';
import { claimDemoAccessSchema } from '@/lib/demo-access/validation';
import { APP_HOME_PATH } from '@/lib/navigation/app-home-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';
  const rl = await consumeMultiRateLimits(ip, 'demo-access-claim', [
    { limit: 8, windowSeconds: 60 },
    { limit: 40, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = claimDemoAccessSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const claim = await claimDemoAccessLink(parsed.data.token, parsed.data.password);
  if (!claim.ok) {
    return NextResponse.json({ error: claim.error }, { status: claim.status });
  }

  const redirectTo = APP_HOME_PATH;
  const response = NextResponse.json({
    ok: true,
    redirect: redirectTo,
    guest_name: claim.link.guest_name,
    reason: claim.link.reason,
    expires_at: claim.link.expires_at,
  });

  return applyDemoSessionCookies(request, response, claim);
}
