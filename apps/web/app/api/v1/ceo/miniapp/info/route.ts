import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkInfo } from '@/lib/ceo/security';
import { limitIp, noStore } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-miniapp-info', 30);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { t?: string } | null;
  const info = body?.t ? await linkInfo(createAdminClient(), body.t) : null;
  if (!info) return NextResponse.json({ error: 'הכפתור לא תקף או שפג תוקפו.' }, { status: 404, ...noStore });
  return NextResponse.json(info, noStore);
}
