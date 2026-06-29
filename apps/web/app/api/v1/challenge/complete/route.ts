import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import type { ChallengeCompletionSummary } from '@/lib/challenge/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const summary = enrollment.completion_summary as ChallengeCompletionSummary | null;

  return NextResponse.json({
    summary,
    wrap_up_seen_at: (enrollment as { wrap_up_seen_at?: string | null }).wrap_up_seen_at ?? null,
    status: enrollment.status,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from('challenge_enrollments')
    .update({
      wrap_up_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id)
    .eq('user_id', auth.user.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enrollment: data });
}
