/**
 * מנוע תוכנית פעולה — מעקב אחרי צעדים מותאמים אישית (מיקרו-סטפים),
 * משוב קל/קשה, תזמון תזכורות לפי סוג CRON, וחזרה הדרגתית למשימה המקורית.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultInterventionReminderIso,
  israelMorningIso,
} from './intervention-engine';
import { israelDayOffsetToUtcIso, israelHour, israelParts } from './time';
import type { AssignmentHistoryEntry } from './types';
import { consecutiveJerusalemDoneDays } from '../../journey/recovery-streak';

export const MICRO_SUCCESS_DAYS_BEFORE_REACTIVATE = 3;
export const RECOMMENDED_SUCCESS_WEEK_DAYS = 7;

export type StepDifficultyRating = 'easy' | 'ok' | 'hard';

type Admin = SupabaseClient;

type AssignmentRow = {
  id: string;
  user_id: string;
  title: string;
  schedule: 'one_time' | 'daily' | 'weekly';
  relation: string | null;
  parent_assignment_id: string | null;
  related_step_id: string | null;
  metadata: Record<string, unknown> | null;
  history: AssignmentHistoryEntry[] | null;
  done_count: number;
};

function countConsecutiveDoneDays(history: AssignmentHistoryEntry[], nowIso: string): number {
  return consecutiveJerusalemDoneDays(history, new Date(nowIso));
}

/**
 * בוחר מתי לשלוח את התזכורת הבאה — מיושר לחלונות habit-checkpoints
 * (בוקר / צהריים / ערב) ולסוג התזמון של המשימה.
 */
export function pickNextRecoveryReminderFireAt(
  schedule: AssignmentRow['schedule'],
  metadata: Record<string, unknown> | null | undefined,
  now: Date
): string {
  const journeySchedule =
    typeof metadata?.journey_schedule === 'string' ? metadata.journey_schedule : null;

  if (journeySchedule === 'per_meal' || metadata?.meal_timing) {
    const hour = israelHour(now);
    if (hour < 11) return israelDayOffsetToUtcIso(now, 0, 12, 30);
    if (hour < 16) return israelDayOffsetToUtcIso(now, 0, 18, 0);
    return israelMorningIso(now, 1);
  }

  if (schedule === 'daily' || journeySchedule === 'daily' || journeySchedule === 'multi_daily') {
    return israelMorningIso(now, 1);
  }

  if (schedule === 'weekly' || journeySchedule === 'weekly') {
    return israelDayOffsetToUtcIso(now, 7, 9, 0);
  }

  return defaultInterventionReminderIso(now);
}

export function buildEncouragementReminder(
  rating: StepDifficultyRating,
  title: string,
  schedule: AssignmentRow['schedule'],
  metadata: Record<string, unknown> | null | undefined
): { title: string; body: string } {
  const short = title.length > 55 ? `${title.slice(0, 55)}…` : title;
  const isMeal =
    metadata?.journey_schedule === 'per_meal' || Boolean(metadata?.meal_timing);

  if (rating === 'easy') {
    return {
      title: 'מעולה! 🌟',
      body: isMeal
        ? `איזה יופי עם "${short}" — תנסה שוב בארוחה הבאה, בקצב שלך.`
        : `איזה יופי עם "${short}" — מחר ננסה שוב, בקצב שלך.`,
    };
  }

  return {
    title: 'המשך ככה 🌿',
    body: isMeal
      ? `"${short}" — נשמור על הקצב. בארוחה הבאה נבדוק שוב איך זה מרגיש.`
      : `"${short}" — נשמור על הקצב. מחר נבדוק שוב איך זה מרגיש.`,
  };
}

export async function scheduleRecoveryEncouragement(params: {
  admin: Admin;
  userId: string;
  assignment: AssignmentRow;
  rating: StepDifficultyRating;
  blockerId?: string | null;
  now?: Date;
}): Promise<{ scheduled: boolean; fire_at?: string }> {
  if (params.rating === 'hard') return { scheduled: false };

  const now = params.now ?? new Date();
  const fireAt = pickNextRecoveryReminderFireAt(
    params.assignment.schedule,
    params.assignment.metadata,
    now
  );
  const { title, body } = buildEncouragementReminder(
    params.rating,
    params.assignment.title,
    params.assignment.schedule,
    params.assignment.metadata
  );

  const dateKey = israelParts(now);
  const remKey = `recovery|${params.assignment.id}|${params.rating}|${fireAt.slice(0, 16)}`;

  const { data: existing } = await params.admin
    .from('scheduled_reminders')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', remKey)
    .maybeSingle();
  if (existing) return { scheduled: false, fire_at: fireAt };

  const { error } = await params.admin.from('scheduled_reminders').insert({
    user_id: params.userId,
    fire_at: fireAt,
    kind: 'followup',
    title,
    body,
    assignment_id: params.assignment.id,
    blocker_id: params.blockerId ?? null,
    status: 'pending',
    dedupe_key: remKey,
    metadata: {
      source: 'recovery_encouragement',
      rating: params.rating,
      scheduled_on: `${dateKey.year}-${String(dateKey.month).padStart(2, '0')}-${String(dateKey.day).padStart(2, '0')}`,
    },
  });

  if (error) return { scheduled: false };
  return { scheduled: true, fire_at: fireAt };
}

/** תזכורת "בוא נבין מה קרה" כשלא עדכנו / ביצוע חלקי */
export async function scheduleStruggleInquiry(params: {
  admin: Admin;
  userId: string;
  signalKind: string;
  taskTitle: string;
  journeyTaskId?: string | null;
  stepId?: string | null;
  assignmentId?: string | null;
  blockerId?: string | null;
  expectedToday: number;
  reportedToday: number;
  now?: Date;
}): Promise<{ scheduled: boolean }> {
  const now = params.now ?? new Date();
  const fireAt = pickNextRecoveryReminderFireAt('daily', { journey_schedule: 'daily' }, now);
  const remKey = `struggle|${params.journeyTaskId ?? params.stepId ?? 'x'}|${params.signalKind}|${fireAt.slice(0, 10)}`;

  const { data: existing } = await params.admin
    .from('scheduled_reminders')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', remKey)
    .maybeSingle();
  if (existing) return { scheduled: false };

  const short = params.taskTitle.length > 50 ? `${params.taskTitle.slice(0, 50)}…` : params.taskTitle;
  const body =
    params.reportedToday > 0
      ? `שמתי לב שסימנת ${params.reportedToday} מתוך ${params.expectedToday} על "${short}" — איך זה הרגיש? אפשר לכוון את הצעד.`
      : `לא עדכנת על "${short}" — הכול בסדר? אם קשה, נמצא צעד קטן יותר יחד.`;

  const { error } = await params.admin.from('scheduled_reminders').insert({
    user_id: params.userId,
    fire_at: fireAt,
    kind: 'followup',
    title: 'רגע קטן לבדוק יחד 🌿',
    body,
    assignment_id: params.assignmentId ?? null,
    blocker_id: params.blockerId ?? null,
    status: 'pending',
    dedupe_key: remKey,
    metadata: {
      source: 'struggle_inquiry',
      signal_kind: params.signalKind,
      expected: params.expectedToday,
      reported: params.reportedToday,
      journey_task_id: params.journeyTaskId ?? null,
      step_id: params.stepId ?? null,
      task_title: params.taskTitle,
    },
  });

  return { scheduled: !error };
}

/** נדנוד שני כשלא ענו לשאילתת recovery */
export async function scheduleRecoveryNoReplyFollowUp(params: {
  admin: Admin;
  userId: string;
  taskTitle: string;
  journeyTaskId?: string | null;
  stepId?: string | null;
  assignmentId?: string | null;
  blockerId?: string | null;
  hoursSince: number;
  now?: Date;
}): Promise<{ scheduled: boolean }> {
  const now = params.now ?? new Date();
  const fireAt = pickNextRecoveryReminderFireAt('daily', { journey_schedule: 'daily' }, now);
  const remKey = `no-reply|${params.journeyTaskId ?? params.taskTitle.slice(0, 20)}|${fireAt.slice(0, 10)}`;

  const { data: existing } = await params.admin
    .from('scheduled_reminders')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', remKey)
    .maybeSingle();
  if (existing) return { scheduled: false };

  const short =
    params.taskTitle.length > 50 ? `${params.taskTitle.slice(0, 50)}…` : params.taskTitle;

  const { error } = await params.admin.from('scheduled_reminders').insert({
    user_id: params.userId,
    fire_at: fireAt,
    kind: 'followup',
    title: 'רק רוצה לוודא שהכול בסדר 💙',
    body: `שאלתי לפני כמה שעות על "${short}" ולא קיבלתי תשובה — זה לגמרי בסדר. אם קשה, נמצא יחד משהו קטן יותר.`,
    assignment_id: params.assignmentId ?? null,
    blocker_id: params.blockerId ?? null,
    status: 'pending',
    dedupe_key: remKey,
    metadata: {
      source: 'recovery_no_reply_followup',
      journey_task_id: params.journeyTaskId ?? null,
      step_id: params.stepId ?? null,
      task_title: params.taskTitle,
      hours_since_inquiry: params.hoursSince,
    },
  });

  return { scheduled: !error };
}

export type RecoveryGraduation = {
  microStreak: number;
  reactivatedParent: boolean;
  weekAtRecommended: boolean;
};

/**
 * בודק אם אפשר להחזיר את המשימה המקורית או לסמן שבוע הצלחה ברמה המומלצת.
 */
export async function evaluateRecoveryGraduation(params: {
  admin: Admin;
  userId: string;
  assignment: AssignmentRow;
  nowIso: string;
}): Promise<RecoveryGraduation> {
  const history = Array.isArray(params.assignment.history) ? params.assignment.history : [];
  const microStreak = countConsecutiveDoneDays(history, params.nowIso);
  let reactivatedParent = false;
  let weekAtRecommended = false;

  if (
    params.assignment.relation === 'eases' &&
    params.assignment.parent_assignment_id &&
    microStreak >= MICRO_SUCCESS_DAYS_BEFORE_REACTIVATE
  ) {
    const { data: parent } = await params.admin
      .from('almog_assignments')
      .select('id, status, history')
      .eq('id', params.assignment.parent_assignment_id)
      .eq('user_id', params.userId)
      .maybeSingle();

    if (parent && (parent as { status: string }).status === 'frozen') {
      const pHist = Array.isArray((parent as { history?: unknown }).history)
        ? ((parent as { history: AssignmentHistoryEntry[] }).history)
        : [];
      await params.admin
        .from('almog_assignments')
        .update({
          status: 'active',
          given_at: params.nowIso,
          history: [
            ...pHist,
            {
              at: params.nowIso,
              action: 'reactivated',
              note: `חזרה הדרגתית אחרי ${microStreak} ימים טובים בצעד המקל`,
            },
          ].slice(-50),
        })
        .eq('id', params.assignment.parent_assignment_id)
        .eq('user_id', params.userId);
      reactivatedParent = true;
    }
  }

  const targetDays =
    typeof params.assignment.metadata?.success_week_days === 'number'
      ? params.assignment.metadata.success_week_days
      : RECOMMENDED_SUCCESS_WEEK_DAYS;

  if (
    params.assignment.relation !== 'eases' &&
    microStreak >= targetDays &&
    params.assignment.related_step_id
  ) {
    weekAtRecommended = true;
  }

  return { microStreak, reactivatedParent, weekAtRecommended };
}
