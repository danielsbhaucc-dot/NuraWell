import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkOptions } from '@/lib/ceo/security';
import { limitIp, noStore } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: the one-time link token itself is the capability; the passkey is the authentication. */
export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-stepup-opt', 30);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { t?: string } | null;
  const o = body?.t ? await linkOptions(createAdminClient(), body.t) : null;
  if (!o) return NextResponse.json({ error: 'הקישור לא תקף או שפג תוקפו.' }, { status: 404, ...noStore });
  return NextResponse.json(o, noStore);
}
