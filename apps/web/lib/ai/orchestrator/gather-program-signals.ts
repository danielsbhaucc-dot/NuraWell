/**
 * 📡 איסוף אותות הפעילות ל-Program Orchestrator.
 *
 * כל האותות נגזרים בקוד מ-Supabase — בלי LLM. המקורות:
 *   - journey_task_executions  → streak ביצוע + "בוצע היום".
 *   - fetchJourneyCompanionContext → שלב המסע + משימות פתוחות + צעד נוכחי.
 *   - fetchTrueLastActiveByUser → ימים מאז תגובה אמיתית אחרונה.
 *   - ai_context + ai_interactions → אות קושי (mood/חסם/נפילה בצ'אט).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AiUserContext } from '../memory';
import { isDailyAvailabilityLowToday } from '../memory';
import { israelDateKey } from '../onboarding-check-in-time';
import { detectRelapseInMessage } from '../roller-coaster';
import { fetchTrueLastActiveByUser, daysBetween } from '../../workflows/habit-checkpoint-batch';
import {
  fetchJourneyCompanionContext,
  type JourneyCompanionContext,
} from '../../workflows/journey-companion';
import type { ProgramActivitySignals } from './program-state';

const STREAK_LOOKBACK_DAYS = 10;

export type GatheredProgramSignals = {
  signals: ProgramActivitySignals;
  /** קונטקסט הליווי — משמש את בונה ההצעה לניסוח הצעד הבא. */
  companion: JourneyCompanionContext | null;
  /** מספר הביצועים שנסגרו היום (לוח ירושלים). */
  doneTodayCount: number;
};

/** רשימת date-keys ל-N הימים האחרונים בלוח ירושלים (כולל היום), מהיום אחורה. */
function recentDateKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(israelDateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

/**
 * רצף ימים רצופים עם לפחות ביצוע אחד. מתחיל מהיום; אם היום עוד ריק —
 * מתחיל מאתמול (כדי לא "לאפס" משתמש עקבי רק כי עוד לא ביצע הבוקר).
 */
function computeConsecutiveCompletedDays(
  doneDateKeys: ReadonlySet<string>,
  now: Date
): number {
  const keys = recentDateKeys(now, STREAK_LOOKBACK_DAYS);
  let streak = 0;
  let started = false;
  for (let i = 0; i < keys.length; i++) {
    const has = doneDateKeys.has(keys[i]!);
    if (i === 0 && !has) {
      // היום עוד ריק — מותר; נמשיך לספור מאתמול.
      continue;
    }
    if (has) {
      streak++;
      started = true;
    } else {
      if (started) break;
      break;
    }
  }
  return streak;
}

/** אות קושי מפורש — נפילה טרייה בצ'אט / mood שלילי / זמינות נמוכה. */
async function detectReportedDifficulty(
  admin: SupabaseClient,
  userId: string,
  aiCtx: AiUserContext,
  now: Date
): Promise<boolean> {
  if (isDailyAvailabilityLowToday(aiCtx.daily_availability, now)) return true;
  if (aiCtx.current_mood_signal === 'frustrated') return true;
  if (aiCtx.dropout_risk === 'high') return true;
  if (aiCtx.fatigue_signal === true) return true;

  // נפילה טרייה בצ'אט — סורקים את הודעות המשתמש מ-36 השעות האחרונות.
  const sinceIso = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('ai_interactions')
    .select('content')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(6);

  for (const row of (data ?? []) as Array<{ content?: string }>) {
    if (typeof row.content === 'string' && detectRelapseInMessage(row.content)) return true;
  }
  return false;
}

export async function gatherProgramSignals(
  admin: SupabaseClient,
  userId: string,
  aiCtx: AiUserContext,
  now: Date = new Date()
): Promise<GatheredProgramSignals> {
  const sinceIso = new Date(
    now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const todayKey = israelDateKey(now);

  const [companion, lastActiveMap, execRes, reportedDifficulty] = await Promise.all([
    fetchJourneyCompanionContext(admin, userId),
    fetchTrueLastActiveByUser(admin, [userId], now),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin
      .from('journey_task_executions')
      .select('date_key, outcome')
      .eq('user_id', userId)
      .gte('completed_at', sinceIso)
      .limit(500),
    detectReportedDifficulty(admin, userId, aiCtx, now),
  ]);

  const doneDateKeys = new Set<string>();
  let doneTodayCount = 0;
  for (const row of (execRes.data ?? []) as Array<{ date_key?: string; outcome?: string }>) {
    const key = typeof row.date_key === 'string' ? row.date_key : '';
    if (!key) continue;
    // רק ביצוע מוצלח נחשב ל-streak (לא attempt_failed/skipped).
    if (row.outcome && row.outcome !== 'completed' && row.outcome !== 'partial') continue;
    doneDateKeys.add(key);
    if (key === todayKey) doneTodayCount++;
  }

  const consecutiveCompletedDays = computeConsecutiveCompletedDays(doneDateKeys, now);
  const daysSinceLastActive = daysBetween(lastActiveMap.get(userId) ?? null, now);

  const openAcceptedCount = companion?.snapshot.openAcceptedCount ?? 0;
  const hasOpenTasksToday = openAcceptedCount > 0;
  // החמצת חלון: יש משימות פתוחות, אפס ביצוע היום, וכבר עבר לפחות יום פעיל.
  const missedActiveWindow =
    hasOpenTasksToday && doneTodayCount === 0 && daysSinceLastActive >= 1;

  // יש לאן להתקדם כל עוד המסע עדיין לא הסתיים (companion != null מסמן צעד פתוח).
  const hasNextStepAvailable = companion != null;

  const signals: ProgramActivitySignals = {
    daysSinceLastActive,
    consecutiveCompletedDays,
    missedActiveWindow,
    reportedDifficulty,
    hasOpenTasksToday,
    hasNextStepAvailable,
    journeyPhase: companion?.phase ?? null,
  };

  return { signals, companion, doneTodayCount };
}
