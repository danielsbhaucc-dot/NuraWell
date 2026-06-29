import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemDateKeyFromDate } from './start-date';
import type { ChallengeCompletionSummary, ChallengeEnrollment } from './types';

export type { ChallengeCompletionSummary };

export async function buildChallengeCompletionSummary(  admin: SupabaseClient,
  enrollment: ChallengeEnrollment,
  firstName: string,
): Promise<ChallengeCompletionSummary> {
  const [{ count: successCount }, { count: completionCount }, { data: successes }, { data: dayRows }] =
    await Promise.all([
      admin
        .from('challenge_success_events')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enrollment.id),
      admin
        .from('challenge_task_completions')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enrollment.id),
      admin
        .from('challenge_success_events')
        .select('title, description')
        .eq('enrollment_id', enrollment.id)
        .order('occurred_at', { ascending: false })
        .limit(5),
      admin
        .from('challenge_task_completions')
        .select('day_index')
        .eq('enrollment_id', enrollment.id),
    ]);

  const daysActive = new Set((dayRows ?? []).map((r) => r.day_index)).size;
  const top = (successes ?? []).map((s) => ({
    title: s.title as string,
    description: (s.description as string | null) ?? null,
  }));

  const message = `${firstName}, סיימת את אתגר 14 הימים! ${
    daysActive >= 10
      ? 'היית פעיל/ה ברוב הימים — זו הצלחה ענקית, גם בלי לדבר על משקל.'
      : 'כל יום שבחרת להשתתף הוא ניצחון. אני גאה בך.'
  } ${successCount && successCount > 0 ? `זיהינו ${successCount} רגעי הצלחה בדרך.` : ''}`.trim();

  return {
    total_success_events: successCount ?? 0,
    total_task_completions: completionCount ?? 0,
    days_active: daysActive,
    top_successes: top,
    message,
    generated_at: new Date().toISOString(),
  };
}

export async function finalizeChallengeIfEnded(
  admin: SupabaseClient,
  enrollment: ChallengeEnrollment & { wrap_up_seen_at?: string | null; completion_summary?: unknown },
  firstName: string,
  now: Date = new Date(),
): Promise<{ finalized: boolean; summary?: ChallengeCompletionSummary }> {
  const todayKey = jerusalemDateKeyFromDate(now);
  if (todayKey <= enrollment.challenge_end_date) return { finalized: false };
  if (enrollment.status === 'completed' && enrollment.completion_summary) {
    return { finalized: false };
  }

  const summary = await buildChallengeCompletionSummary(admin, enrollment, firstName);

  await admin
    .from('challenge_enrollments')
    .update({
      status: 'completed',
      completion_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);

  return { finalized: true, summary };
}
