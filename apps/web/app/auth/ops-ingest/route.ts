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

/**
 * Route Handlers must not NextResponse.rewrite() to /__nf — that 500s on the Ops host.
 * Bounce to a nonexistent path so middleware serves the same stealth HTML 404.
 */
async function fail(request: NextRequest, reason: string, userId: string | null = null) {
  try {
    await createAdminClient().from('admin_audit_log').insert({ actor_id: userId, method: 'SECURITY', path: 'ops_ingest_rejected', detail: { reason } });
  } catch { /* best-effort */ }
  return notFound(request);
}

function notFound(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/.well-known/nw-missing/${Date.now().toString(36)}`;
  url.search = '';
  const res = NextResponse.redirect(url, 307);
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

/** Ops host: claim a one-time handoff (60 s) and mint a NEW Ops session + child device cookie. */
export async function GET(request: NextRequest) {
  try {
    const host = request.nextUrl.hostname.toLowerCase();
    if (process.env.NODE_ENV === 'production' && !isOpsHostname(host) && !isOpsPreviewHostname(host)) return notFound(request);
    const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
    const rl = await consumeRateLimit({ key: ip, namespace: 'ops-ingest', limit: 10, windowSeconds: 600 });
    if (!rl.ok) return notFound(request); // not logged: would let a flood write rows

    const token = (request.nextUrl.searchParams.get('t') ?? '').trim();
    // Cheap reject before admin client / DB — still goes through the same bounce→404 path.
    if (token.length < 16) return notFound(request);

    const db = createAdminClient();
    const claim = await claimHandoff(db, token, request.headers);
    if (!claim.ok) return fail(request, `claim_${claim.reason}`);

    const { data: u } = await db.auth.admin.getUserById(claim.userId);
    const email = u.user?.email;
    if (!email) return fail(request, 'no_email', claim.userId);
    // server-side magic-link token (never emailed) → verified right here → fresh session for this host
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) return fail(request, 'link_failed', claim.userId);

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
    if (error || v.user?.id !== claim.userId) return fail(request, 'verify_failed', claim.userId);

    const dev = await createTrustedDevice(db, claim.userId, deviceLabel(request.headers.get('user-agent')), 'handoff', claim.deviceId);
    response.cookies.set(DEVICE_COOKIE, dev, cookieOpts(DEVICE_MAX_AGE_S));
    await audit(db, claim.userId, 'ops_session_minted', { parent: claim.deviceId });
    return response;
  } catch {
    return fail(request, 'exception');
  }
}
