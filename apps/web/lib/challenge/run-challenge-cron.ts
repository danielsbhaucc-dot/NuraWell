import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemDateKey, jerusalemMinutesIntoDay } from '@/lib/journey/task-schedule';
import { currentChallengeDayIndex } from './start-date';
import { finalizeChallengeIfEnded } from './completion-summary';
import { scanAndPersistChallengeSuccesses } from './success-detectors';
import { sendChallengeNotification, challengeNotificationExists } from './challenge-notify';
import type { ChallengeEnrollment } from './types';

export type ChallengeCronResult = {
  processed: number;
  reminders_sent: number;
  finalized: number;
  successes_detected: number;
  errors: string[];
};

type EnrollmentRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  challenge_start_date: string;
  challenge_end_date: string;
  status: string;
  is_demo: boolean;
  demo_simulated_day: number | null;
  wrap_up_seen_at: string | null;
  completion_summary: unknown;
  metadata: Record<string, unknown>;
};

export async function runChallengeDailyCron(
  admin: SupabaseClient,
  opts?: { dryRun?: boolean },
): Promise<ChallengeCronResult> {
  const dryRun = opts?.dryRun ?? false;
  const result: ChallengeCronResult = {
    processed: 0,
    reminders_sent: 0,
    finalized: 0,
    successes_detected: 0,
    errors: [],
  };

  const { data: enrollments, error } = await admin
    .from('challenge_enrollments')
    .select(
      'id, user_id, campaign_id, challenge_start_date, challenge_end_date, status, is_demo, demo_simulated_day, wrap_up_seen_at, completion_summary, metadata',
    )
    .in('status', ['waiting', 'active'])
    .eq('is_demo', false);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const todayKey = jerusalemDateKey();
  const mins = jerusalemMinutesIntoDay();

  for (const row of (enrollments ?? []) as EnrollmentRow[]) {
    result.processed++;
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', row.user_id)
        .maybeSingle();

      const firstName = (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ?? 'חבר/ה';

      const enrollment: ChallengeEnrollment = {
        id: row.id,
        user_id: row.user_id,
        campaign_id: row.campaign_id,
        registered_at: '',
        challenge_start_date: row.challenge_start_date,
        challenge_end_date: row.challenge_end_date,
        status: row.status as ChallengeEnrollment['status'],
        eating_window: null,
        intro_completed_at: null,
        interview_completed_at: null,
        is_demo: false,
        demo_scenario: null,
        demo_simulated_day: row.demo_simulated_day,
        metadata: row.metadata ?? {},
      };

      const { data: interview } = await admin
        .from('challenge_interview_sessions')
        .select('extracted_insights')
        .eq('enrollment_id', row.id)
        .maybeSingle();

      const baseline = (interview?.extracted_insights as { language_baseline?: string } | null)
        ?.language_baseline;

      if (!dryRun) {
        const n = await scanAndPersistChallengeSuccesses(admin, enrollment, {
          baselineText: baseline ?? null,
        });
        result.successes_detected += n;
      }

      const dayIndex = currentChallengeDayIndex(
        row.challenge_start_date,
        row.challenge_end_date,
        new Date(),
        row.demo_simulated_day,
      );

      if (todayKey > row.challenge_end_date) {
        if (!dryRun) {
          const { finalized, summary } = await finalizeChallengeIfEnded(
            admin,
            {
              ...enrollment,
              wrap_up_seen_at: row.wrap_up_seen_at,
              completion_summary: row.completion_summary,
            },
            firstName,
          );
          if (finalized && summary) {
            result.finalized++;
            await sendChallengeNotification(admin, {
              userId: row.user_id,
              title: `${firstName}, סיימת את האתגר! 🎉`,
              body: summary.message,
              actionUrl: '/challenge/complete',
              type: 'achievement',
            });
            result.reminders_sent++;
          }
        }
        continue;
      }

      if (dayIndex <= 0 || row.status !== 'active') continue;

      const morningWindow = mins >= 7 * 60 && mins < 10 * 60;
      if (morningWindow && !dryRun) {
        const dedupe = `challenge_daily_${row.id}_${todayKey}`;
        const exists = await challengeNotificationExists(admin, row.user_id, dedupe);

        if (!exists) {
          await sendChallengeNotification(admin, {
            userId: row.user_id,
            title: `יום ${dayIndex} — בוא/י נתחיל`,
            body: `${firstName}, האתגר ממשיך! היום מחולק למשימות קטנות — כל אחת מהן נספרת כהצלחה.`,
            actionUrl: '/challenge/dashboard',
            type: 'reminder',
            dedupeKey: dedupe,
          });
          result.reminders_sent++;
        }
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}
