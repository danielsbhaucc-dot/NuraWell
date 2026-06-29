import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemDateKey, jerusalemMinutesIntoDay } from '@/lib/journey/task-schedule';
import type { UserScheduleProfile } from '@/lib/journey/profile-schedule';
import {
  challengeNotificationExists,
  sendChallengeNotification,
} from './challenge-notify';
import { isEatingWindowClosingSoon } from './eating-window-status';
import { getTodayTasks, getCompletionsForDay } from './enrollment';
import { countRequiredCompletionsForDay } from './task-slots';
import { currentChallengeDayIndex } from './start-date';
import type { ChallengeEnrollment, EatingWindowConfig } from './types';

export type ChallengeHourlyResult = {
  processed: number;
  reminders_sent: number;
  errors: string[];
};

type Row = {
  id: string;
  user_id: string;
  campaign_id: string;
  challenge_start_date: string;
  challenge_end_date: string;
  status: string;
  is_demo: boolean;
  demo_simulated_day: number | null;
  eating_window: EatingWindowConfig | null;
};

export async function runChallengeHourlyReminders(
  admin: SupabaseClient,
  opts?: { dryRun?: boolean },
): Promise<ChallengeHourlyResult> {
  const dryRun = opts?.dryRun ?? false;
  const result: ChallengeHourlyResult = { processed: 0, reminders_sent: 0, errors: [] };
  const todayKey = jerusalemDateKey();
  const mins = jerusalemMinutesIntoDay();

  const { data: rows, error } = await admin
    .from('challenge_enrollments')
    .select(
      'id, user_id, campaign_id, challenge_start_date, challenge_end_date, status, is_demo, demo_simulated_day, eating_window',
    )
    .eq('status', 'active')
    .eq('is_demo', false);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (rows ?? []) as Row[]) {
    result.processed++;
    try {
      if (todayKey < row.challenge_start_date || todayKey > row.challenge_end_date) continue;

      const dayIndex = currentChallengeDayIndex(
        row.challenge_start_date,
        row.challenge_end_date,
        new Date(),
        row.demo_simulated_day,
      );
      if (dayIndex <= 0) continue;

      const { data: profile } = await admin
        .from('profiles')
        .select('full_name, wake_up_time, sleep_time, meal_count, meal_schedule')
        .eq('id', row.user_id)
        .maybeSingle();

      const firstName =
        (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ?? 'חבר/ה';

      const scheduleProfile: UserScheduleProfile = {
        wake_up_time: profile?.wake_up_time as string | null,
        sleep_time: profile?.sleep_time as string | null,
        meal_count: profile?.meal_count as number | null,
        meal_schedule: profile?.meal_schedule as UserScheduleProfile['meal_schedule'],
      };

      const eatingWindow = row.eating_window as EatingWindowConfig | null;
      if (eatingWindow && isEatingWindowClosingSoon(eatingWindow)) {
        const dedupe = `challenge_window_close_${row.id}_${todayKey}`;
        const exists = await challengeNotificationExists(admin, row.user_id, dedupe);
        if (!exists && !dryRun) {
          await sendChallengeNotification(admin, {
            userId: row.user_id,
            title: `${firstName}, החלון נסגר בקרוב`,
            body: 'עוד כ-10 דקות לסגירת חלון האכילה — אם צריך, זה הזמן לארוחה אחרונה.',
            actionUrl: '/challenge/dashboard',
            type: 'reminder',
            dedupeKey: dedupe,
          });
          result.reminders_sent++;
        }
      }

      const eveningWindow = mins >= 19 * 60 && mins < 20 * 60 + 30;
      if (eveningWindow) {
        const enrollment: ChallengeEnrollment = {
          id: row.id,
          user_id: row.user_id,
          campaign_id: row.campaign_id,
          registered_at: '',
          challenge_start_date: row.challenge_start_date,
          challenge_end_date: row.challenge_end_date,
          status: 'active',
          eating_window: eatingWindow,
          intro_completed_at: null,
          interview_completed_at: null,
          is_demo: false,
          demo_scenario: null,
          demo_simulated_day: row.demo_simulated_day,
          metadata: {},
        };

        const [tasks, completions] = await Promise.all([
          getTodayTasks(admin, enrollment, dayIndex),
          getCompletionsForDay(admin, row.id, dayIndex),
        ]);

        const required = countRequiredCompletionsForDay(tasks, scheduleProfile);
        const done = completions.length;

        if (done < required) {
          const dedupe = `challenge_evening_${row.id}_${todayKey}`;
          const exists = await challengeNotificationExists(admin, row.user_id, dedupe);
          if (!exists && !dryRun) {
            await sendChallengeNotification(admin, {
              userId: row.user_id,
              title: `עוד ${required - done} משימות ליום ${dayIndex}`,
              body: `${firstName}, הערב מתקרב — יש עוד הזדמנות לסמן הצלחות קטנות היום.`,
              actionUrl: '/challenge/dashboard',
              type: 'reminder',
              dedupeKey: dedupe,
            });
            result.reminders_sent++;
          }
        }
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}
