import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../../../lib/api/route-guards';
import { isAvoidPushActive } from '../../../../../../../lib/ai/avoid-push';
import { fetchTodayAlmogTouches } from '../../../../../../../lib/ai/almog-notify-day-context';
import { normalizeCheckInTimes } from '../../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../../lib/supabase/admin';
import { jsonZodError } from '../../../../../../../lib/validation/zod-http';
import {
  habitCheckpointSlotSchema,
  type HabitCheckpointSlot,
} from '../../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import {
  computeCadenceStage,
  daysBetween,
  fetchTrueLastActiveByUser,
  isSlotAllowedForCadenceStage,
  planHabitCheckpointTriggers,
  type ProgressRow,
} from '../../../../../../../lib/workflows/habit-checkpoint-batch';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
  parseJourneyHabitsJson,
} from '../../../../../../../lib/workflows/habit-checkpoint-eligibility';

/**
 * /api/v1/ai/cron/habit-checkpoints/diagnose
 * --------------------------------------------
 * Endpoint READ-ONLY שמסביר *למה* משתמש מסוים יקבל / לא יקבל תזכורת בחלון מסוים.
 *
 * אין INSERT, אין שליחה לטריגר Workflow — רק SELECTים על Supabase + הרצת
 * `planHabitCheckpointTriggers` כדי לראות בדיוק את ההחלטה.
 *
 * שימושים:
 *   1) משתמש מחובר → דיבוג של עצמו (userId=session.id).
 *   2) Bearer CRON_SECRET → דיבוג של כל userId (ops).
 *
 * החזרה כוללת:
 *   - blockers[]      → סיבות סינון פעילות (avoid_push, personalized_schedule, ghosted_cooldown)
 *   - eligibility     → מה ה-plan החליט (would_send, notifyMode, slot allowed?)
 *   - data            → ספירת הרגלים/משימות פתוחות
 *   - cadence         → daysSinceLastActive + stage
 *   - touches_today   → כמה מגעי אלמוג נשלחו היום ומה ההיסטוריה
 */
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    userId: z.string().uuid().optional(),
    slot: habitCheckpointSlotSchema.optional(),
  })
  .strict();

type AdminClient = ReturnType<typeof createAdminClient>;

function slotFromJerusalemNow(now: Date): HabitCheckpointSlot {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(now)
  );
  if (Number.isNaN(hour)) return 'morning';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'midday';
  return 'evening';
}

async function fetchUserProgressRows(
  admin: AdminClient,
  userId: string
): Promise<ProgressRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('journey_progress')
    .select(
      `
      user_id,
      updated_at,
      is_completed,
      task_statuses,
      habits_progress,
      journey_steps (
        title,
        habits,
        tasks,
        journey_stations ( title )
      )
    `
    )
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data ?? []) as ProgressRow[];
}

async function fetchProfile(admin: AdminClient, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('profiles')
    .select(
      'id, full_name, ai_context, ai_check_in_times, ai_system_prompt, onboarding_completed, last_active_at'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as {
    id: string;
    full_name: string | null;
    ai_context: Record<string, unknown> | null;
    ai_check_in_times: unknown;
    ai_system_prompt: string | null;
    onboarding_completed: boolean | null;
    last_active_at: string | null;
  } | null;
}

async function fetchTodayExecutionsByTask(
  admin: AdminClient,
  userId: string,
  dateKey: string
): Promise<Map<string, Set<string>>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('journey_task_executions')
    .select('task_id, slot')
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .limit(500);

  const out = new Map<string, Set<string>>();
  if (Array.isArray(data)) {
    for (const row of data as Array<{ task_id?: string; slot?: string }>) {
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
      if (!tid || !sl) continue;
      let set = out.get(tid);
      if (!set) {
        set = new Set<string>();
        out.set(tid, set);
      }
      set.add(sl);
    }
  }
  return out;
}

async function fetchAlreadySentThisSlot(
  admin: AdminClient,
  userId: string,
  dateKey: string,
  slot: HabitCheckpointSlot
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!Array.isArray(data)) return false;
  return data.some((row: { metadata?: unknown }) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    return (
      m?.source === 'almog_habit_checkpoint' &&
      m?.checkpoint_date === dateKey &&
      m?.slot === slot
    );
  });
}

async function fetchGhostedCooldownActive(
  admin: AdminClient,
  userId: string,
  now: Date
): Promise<boolean> {
  const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', weekAgoIso)
    .limit(50);

  if (!Array.isArray(data)) return false;
  return data.some((row: { metadata?: unknown }) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    return m?.source === 'almog_habit_checkpoint';
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization');
  const hasCronBearer = Boolean(secret && authHeader === `Bearer ${secret}`);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value ?? {});
  if (!parsed.success) return jsonZodError(parsed.error, 'Invalid request body');
  const body = parsed.data;

  let targetUserId: string;
  if (hasCronBearer) {
    if (!body.userId) {
      return NextResponse.json(
        { error: 'userId required when using Bearer CRON_SECRET' },
        { status: 400 }
      );
    }
    targetUserId = body.userId;
  } else {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    if (body.userId && body.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: cannot diagnose another user without Bearer' },
        { status: 403 }
      );
    }
    targetUserId = session.user.id;
  }

  const now = new Date();
  const slot = body.slot ?? slotFromJerusalemNow(now);
  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const admin = createAdminClient();

  let profile;
  let progressRows: ProgressRow[];
  let todayExecutions: Map<string, Set<string>>;
  let alreadySent: boolean;

  try {
    [profile, progressRows, todayExecutions, alreadySent] = await Promise.all([
      fetchProfile(admin, targetUserId),
      fetchUserProgressRows(admin, targetUserId),
      fetchTodayExecutionsByTask(admin, targetUserId, dateKey),
      fetchAlreadySentThisSlot(admin, targetUserId, dateKey, slot),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: 'profile_not_found', target_user_id: targetUserId },
      { status: 404 }
    );
  }

  /** ===========================
   *  אבחון ה-blockers (גורמי סינון)
   * =========================== */
  const blockers: Array<{ kind: string; explanation_he: string }> = [];

  if (isAvoidPushActive(profile.ai_context)) {
    blockers.push({
      kind: 'avoid_push',
      explanation_he:
        'המשתמש סימן avoid_push=true ב-ai_context (או avoid_push_until בעתיד). שנה ב-/settings/almog.',
    });
  }

  const checkInTimes = normalizeCheckInTimes(profile.ai_check_in_times);

  const lastActiveByUser = await fetchTrueLastActiveByUser(admin, [targetUserId], now);
  const trueLastActive = lastActiveByUser.get(targetUserId) ?? null;
  const daysSinceLastActive = daysBetween(trueLastActive, now);
  const cadenceStage = computeCadenceStage(daysSinceLastActive);

  if (cadenceStage === 'ghosted') {
    const cooldownActive = await fetchGhostedCooldownActive(admin, targetUserId, now);
    if (cooldownActive) {
      blockers.push({
        kind: 'ghosted_weekly_cooldown',
        explanation_he:
          'המשתמש במצב ghosted (14+ ימים בלי פעילות) וכבר נשלחה הודעה ב-7 ימים אחרונים. cooldown של שבוע.',
      });
    }
  }

  if (alreadySent) {
    blockers.push({
      kind: 'already_sent_this_slot',
      explanation_he: `כבר נשלחה היום התראת habit_checkpoint לאותו slot (${slot}, ${dateKey}). Gate ב-Workflow חוסם כפילות.`,
    });
  }

  const touchesToday = await fetchTodayAlmogTouches(admin, targetUserId);
  const unansweredCount = touchesToday.filter((t) => !t.userRepliedSince).length;
  if (unansweredCount >= 8) {
    blockers.push({
      kind: 'touch_fatigue',
      explanation_he: `${unansweredCount} מגעים בלי תשובה היום — Gate חוסם remind (לא reinforce/presence).`,
    });
  }

  /** ===========================
   *  ניתוח הצרכים בפועל (data)
   * =========================== */
  const allHabits = progressRows
    .flatMap((r) => parseJourneyHabitsJson(r.journey_steps?.habits))
    .filter((h, i, arr) => arr.findIndex((x) => x.id === h.id) === i);
  const slotHabits = filterHabitsForSlot(allHabits, slot, weekday);

  /**
   * `planHabitCheckpointTriggers` מצפה למפה רב-משתמשית
   * (user → task → slots). פה אנחנו מאבחנים משתמש יחיד, ולכן עוטפים
   * את המפה הפנימית תחת `targetUserId`.
   */
  const todayExecutionsByUser = new Map([[targetUserId, todayExecutions]]);
  const plan = planHabitCheckpointTriggers(
    progressRows,
    slot,
    now,
    todayExecutionsByUser,
    lastActiveByUser
  );
  const userPlan = plan.find((p) => p.userId === targetUserId) ?? null;

  if (
    profile.onboarding_completed === true &&
    checkInTimes.length > 0 &&
    (userPlan?.payload.pendingTasks.length ?? 0) === 0
  ) {
    blockers.push({
      kind: 'personalized_schedule',
      explanation_he: `למשתמש יש ${checkInTimes.length} זמני check-in אישיים מההרשמה (${checkInTimes.join(', ')}) — בלי משימה פתוחה הוא מקבל דרך Schedule 5 (onboarding-check-ins) במקום habit-checkpoints. אם יש pendingTasks, החסם הזה לא מופעל.`,
    });
  }

  const wouldSend = !!userPlan && blockers.length === 0;

  /** ===========================
   *  הסבר אנושי
   * =========================== */
  let summary_he: string;
  if (wouldSend) {
    const habitsCount = userPlan!.payload.habits.length;
    const tasksCount = userPlan!.payload.pendingTasks.length;
    summary_he = `✅ יישלח (${userPlan!.payload.notifyMode}). ${habitsCount} הרגלים + ${tasksCount} משימות פתוחות.`;
  } else if (blockers.length > 0) {
    summary_he = `❌ לא יישלח. חוסמים: ${blockers.map((b) => b.kind).join(', ')}`;
  } else if (!userPlan) {
    /** plan ריק → המשתמש לא עבר את הסינון הפנימי */
    const reasons: string[] = [];
    if (slotHabits.length === 0) {
      reasons.push(`אין הרגלים תואמי slot=${slot} (daily רק בוקר; weekly רק ביום שלהם)`);
    }
    if (
      cadenceStage !== 'active' &&
      !isSlotAllowedForCadenceStage(slot, cadenceStage)
    ) {
      reasons.push(`cadenceStage=${cadenceStage} לא מאפשר ${slot} ללא משימה פתוחה`);
    }
    summary_he = `⚪ לא יישלח: אין משימות accepted פתוחות + ${reasons.join(' + ') || 'אין הרגל פתוח לחלון זה'}.`;
  } else {
    summary_he = 'מצב לא מוגדר.';
  }

  return NextResponse.json({
    ok: true,
    mode: 'diagnose_read_only',
    target_user_id: targetUserId,
    full_name: profile.full_name,
    slot,
    checkpoint_date: dateKey,
    weekday_jerusalem: weekday,
    server_time_iso: now.toISOString(),
    would_send: wouldSend,
    summary_he,
    blockers,
    profile: {
      onboarding_completed: profile.onboarding_completed,
      has_ai_system_prompt: Boolean(profile.ai_system_prompt?.trim()),
      ai_check_in_times: checkInTimes,
      avoid_push_active: isAvoidPushActive(profile.ai_context),
      last_active_at_profile: profile.last_active_at,
      true_last_active_at: trueLastActive,
    },
    cadence: {
      days_since_last_active: Number.isFinite(daysSinceLastActive)
        ? daysSinceLastActive
        : null,
      stage: cadenceStage,
      slot_allowed_for_stage: isSlotAllowedForCadenceStage(slot, cadenceStage),
    },
    data: {
      progress_rows: progressRows.length,
      all_habits_count: allHabits.length,
      slot_habits_count: slotHabits.length,
      today_executions_count: [...todayExecutions.values()].reduce(
        (sum, set) => sum + set.size,
        0
      ),
      already_sent_this_slot: alreadySent,
      unanswered_touches_today: unansweredCount,
    },
    plan_decision: userPlan
      ? {
          would_be_in_plan: true,
          notify_mode: userPlan.payload.notifyMode,
          reinforce_kind: userPlan.payload.reinforceKind ?? null,
          habits_in_payload: userPlan.payload.habits.map((h) => ({
            id: h.id,
            title: h.title,
          })),
          pending_tasks_in_payload: userPlan.payload.pendingTasks.map((t) => ({
            id: t.id,
            title: t.title,
            pending_slot_labels: t.pendingSlotLabels ?? null,
            schedule_label: t.scheduleLabel ?? null,
          })),
        }
      : { would_be_in_plan: false },
    hint_he:
      'אם would_send=true → ה-cron האמיתי ישלח בסיבוב הבא של ה-slot. אם false → ראה blockers/plan_decision להבנת הסיבה.',
  });
}
