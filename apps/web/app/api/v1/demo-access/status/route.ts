import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { DEMO_ACCESS_COOKIE, parseDemoAccessCookie } from '@/lib/demo-access/cookie';
import { isDemoAccessActiveForUser } from '@/lib/demo-access/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${DEMO_ACCESS_COOKIE}=([^;]*)`));
  const rawCookie = match ? decodeURIComponent(match[1]!) : undefined;
  const payload = await parseDemoAccessCookie(rawCookie);

  if (!payload || payload.userId !== auth.user.id) {
    return NextResponse.json({ active: false });
  }

  const active = await isDemoAccessActiveForUser(auth.user.id);
  if (!active) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    guest_name: payload.guestName,
    reason: payload.reason,
    expires_at: new Date(payload.expMs).toISOString(),
    link_id: payload.linkId,
  });
}
