import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { buildChallengePatternInsights } from '@/lib/challenge/insights';
import { currentChallengeDayIndex } from '@/lib/challenge/start-date';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ insights: [] });
  }

  const dayIndex = currentChallengeDayIndex(
    enrollment.challenge_start_date,
    enrollment.challenge_end_date,
    new Date(),
    enrollment.demo_simulated_day,
  );

  const [{ data: events }, { data: completions }] = await Promise.all([
    auth.supabase
      .from('challenge_success_events')
      .select('event_type, title, description')
      .eq('enrollment_id', enrollment.id)
      .order('occurred_at', { ascending: false })
      .limit(30),
    auth.supabase
      .from('challenge_task_completions')
      .select('day_index, task_definition_id')
      .eq('enrollment_id', enrollment.id),
  ]);

  const insights = buildChallengePatternInsights({
    successEvents: (events ?? []) as Array<{
      event_type: string;
      title: string;
      description: string | null;
    }>,
    completions: (completions ?? []) as Array<{ day_index: number; task_definition_id: string }>,
    currentDay: dayIndex,
    daysTotal: enrollment.campaign?.duration_days ?? 14,
  });

  return NextResponse.json({ insights });
}
