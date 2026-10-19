import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookieOpts, DEVICE_COOKIE, DEVICE_MAX_AGE_S, PENDING_COOKIE, redeemEmailLink } from '@/lib/ops/device-trust';
import { limitIp } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Email "אשר כניסה" link: signed one-time token + must be the same browser that holds the pending cookie. */
export async function GET(request: Request) {
  const limited = await limitIp(request, 'ops-device-email-link', 10);
  if (limited) return limited;
  const back = (q: string) => NextResponse.redirect(new URL(`/device-check?${q}`, request.url), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  const auth = await requireApiAdmin(request, { skipDeviceGate: true });
  if (!auth.ok) return back('e=session');
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const pending = request.headers.get('cookie')?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${PENDING_COOKIE}=`))?.slice(PENDING_COOKIE.length + 1);
  const out = await redeemEmailLink(createAdminClient(), auth.user.id, token, pending ? decodeURIComponent(pending) : null);
  if (!out.ok) return back(`e=${encodeURIComponent(out.error)}`);
  const res = NextResponse.redirect(new URL('/auth/bridge-to-ops', request.url), { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(DEVICE_COOKIE, out.cookie, cookieOpts(DEVICE_MAX_AGE_S));
  res.cookies.set(PENDING_COOKIE, '', cookieOpts(0));
  return res;
}
