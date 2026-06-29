import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { getUserEnrollment } from '@/lib/challenge/enrollment';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ events: [] });
  }

  const { data } = await auth.supabase
    .from('challenge_success_events')
    .select('id, event_type, title, description, detected_by, occurred_at')
    .eq('enrollment_id', enrollment.id)
    .order('occurred_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ events: data ?? [] });
}
