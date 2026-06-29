import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { jerusalemDateKeyFromDate } from '@/lib/challenge/start-date';

export const dynamic = 'force-dynamic';

/** דמו מלא — מקדים את תאריך ההתחלה להיום (מנהל בלבד) */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment?.is_demo || enrollment.demo_scenario !== 'full') {
    return NextResponse.json({ error: 'Not a full demo enrollment' }, { status: 400 });
  }

  const today = jerusalemDateKeyFromDate(new Date());
  const { error } = await auth.supabase
    .from('challenge_enrollments')
    .update({
      challenge_start_date: today,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, challenge_start_date: today });
}
