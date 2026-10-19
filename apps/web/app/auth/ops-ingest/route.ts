import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOpsHostname, isOpsPreviewHostname } from '@/lib/ops-host';
import { claimHandoff } from '@/lib/ops/handoff';
import { audit, cookieOpts, createTrustedDevice, DEVICE_COOKIE, DEVICE_MAX_AGE_S, deviceLabel } from '@/lib/ops/device-trust';
import { consumeRateLimit } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Anything wrong → the same generic 404 as any missing page (no hints). */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL('/__nf', request.url));
}

/** Ops host: claim a one-time handoff (60 s) and mint a NEW Ops session + child device cookie. */
export async function GET(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  if (process.env.NODE_ENV === 'production' && !isOpsHostname(host) && !isOpsPreviewHostname(host)) return notFound(request);
  const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  const rl = await consumeRateLimit({ key: ip, namespace: 'ops-ingest', limit: 10, windowSeconds: 600 });
  if (!rl.ok) return notFound(request);

  const db = createAdminClient();
  const claim = await claimHandoff(db, request.nextUrl.searchParams.get('t') ?? '', request.headers);
  if (!claim.ok) return notFound(request);

  const { data: u } = await db.auth.admin.getUserById(claim.userId);
  const email = u.user?.email;
  if (!email) return notFound(request);
  // server-side magic-link token (never emailed) → verified right here → fresh session for this host
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return notFound(request);

  const response = NextResponse.redirect(new URL('/', request.url));
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => { response.cookies.set(mergeAuthCookieOptions({ name, value, ...options })); },
      remove: (name: string, options: CookieOptions) => { response.cookies.set(mergeAuthCookieOptions({ name, value: '', ...options })); },
    },
  });
  const { data: v, error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (error || v.user?.id !== claim.userId) return notFound(request);

  const dev = await createTrustedDevice(db, claim.userId, deviceLabel(request.headers.get('user-agent')), 'handoff', claim.deviceId);
  response.cookies.set(DEVICE_COOKIE, dev, cookieOpts(DEVICE_MAX_AGE_S));
  await audit(db, claim.userId, 'ops_session_minted', { parent: claim.deviceId });
  return response;
}
