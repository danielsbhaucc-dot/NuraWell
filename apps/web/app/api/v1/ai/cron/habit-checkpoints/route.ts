import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import { normalizeCheckInTimes } from '../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { habitCheckpointSlotSchema } from '../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import {
  fetchTrueLastActiveByUser,
  planHabitCheckpointTriggersWithChat,
  type ProgressRow,
  type RecentExecutionsByUser,
  type ReengagementInfoByUser,
  type ReengagementUserInfo,
  type UserResponseInfo,
} from '../../../../../../lib/workflows/habit-checkpoint-batch';
import { isChurnReengagementEnabled } from '../../../../../../lib/churn/feature-flags';
import { readReengagementContext } from '../../../../../../lib/churn/patch-reengagement-context';
import { updateEngagementStatuses } from '../../../../../../lib/churn/update-engagement-status';
import {
  goalToHebrew,
  obstacleToHebrew,
} from '../../../../../../lib/churn/reengagement-prompt-blocks';
import { jerusalemDateKey } from '../../../../../../lib/journey/task-schedule';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const PROGRESS_SELECTS = [
  `
      user_id,
      updated_at,
      is_completed,
      task_statuses,
      habits_progress,
      task_level_meta,
      journey_steps (
        title,
        habits,
        tasks,
        journey_stations ( title )
      )
    `,
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
    `,
];

const PROFILE_SELECTS = [
  'id, ai_context, onboarding_completed, ai_check_in_times, last_responded_at, notification_count, main_goal, main_obstacle, main_obstacle_detail, streak_days, engagement_status, ai_system_prompt, meal_count, meal_schedule',
  'id, ai_context, onboarding_completed, ai_check_in_times, last_responded_at, notification_count, meal_count, meal_schedule',
  'id, ai_context, onboarding_completed, ai_check_in_times, last_responded_at, notification_count',
  'id, ai_context, onboarding_completed, ai_check_in_times',
  'id, ai_context, onboarding_completed',
  'id',
];

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message ?? '');
}

async function selectWithFallbacks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFactory: (select: string) => any,
  selects: string[]
) {
  let lastError: { code?: string; message?: string } | null = null;
  for (const select of selects) {
    const { data, error } = await queryFactory(select);
    if (!error) return { data, error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
}

/**
 * גוזר slot משעת ישראל כש-?slot= חסר ב-URL. כך תזכורות נשלחות גם אם ה-Upstash
 * Schedule לא הוגדר עם הפרמטר (אחרת היה מחזיר 400 ולא נשלח כלום).
 *   בוקר   05:00–11:59
 *   צהריים 12:00–16:59
 *   ערב    17:00–04:59
 */
function deriveSlotFromJerusalemHour(now: Date): 'morning' | 'midday' | 'evening' {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const hour = Number(hourStr);
  if (Number.isFinite(hour) && hour >= 12 && hour < 17) return 'midday';
  if (Number.isFinite(hour) && (hour >= 17 || hour < 5)) return 'evening';
  return 'morning';
}

async function runHabitCheckpointCron(request: Request) {
  const url = new URL(request.url);
  const slotRaw = url.searchParams.get('slot');

  /**
   * slot מפורש מנצח; אם חסר — גוזרים משעת ישראל (עמידות ל-Schedule בלי הפרמטר).
   * ערך לא תקין (לא ריק) עדיין מחזיר 400 כדי לחשוף טעות הגדרה.
   */
  let slot: 'morning' | 'midday' | 'evening';
  if (!slotRaw) {
    slot = deriveSlotFromJerusalemHour(new Date());
  } else {
    const slotParsed = habitCheckpointSlotSchema.safeParse(slotRaw);
    if (!slotParsed.success) {
      return NextResponse.json({ error: 'slot לא תקין (morning|midday|evening)' }, { status: 400 });
    }
    slot = slotParsed.data;
  }

  /** dryRun=1 — מאפשר לבדוק תזמון מיד, מחזיר את התכנון בלי לטרגר Workflow אמיתי */
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token && !isDryRun) {
    return NextResponse.json({ error: 'חסר QSTASH_TOKEN לטריגר Workflow' }, { status: 500 });
  }

  const maxTriggers = Math.min(
    800,
    Math.max(1, Number(process.env.CRON_MAX_HABIT_CHECKPOINT_TRIGGERS) || 350)
  );

  const admin = createAdminClient();

  const { data: progressRows, error: progErr } = await selectWithFallbacks(
    (select) => admin.from('journey_progress').select(select),
    PROGRESS_SELECTS
  );

  if (progErr) {
    return NextResponse.json({ error: progErr.message }, { status: 500 });
  }

  const now = new Date();
  const progressUserIds = [
    ...new Set(
      ((progressRows ?? []) as Array<{ user_id?: string }>)
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];

  /**
   * טוען ביצועי משימות-חוזרות של היום עבור כל המשתמשים — כדי שאלמוג לא יתזכר
   * סלוט שכבר בוצע (multi_daily 2/3 → לא נשלח, full→drop).
   */
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: execRows } = await admin
    .from('journey_task_executions')
    .select('user_id, task_id, slot, outcome')
    .eq('date_key', todayKey)
    .limit(20000);

  const todayExecutionsByUser = new Map<string, Map<string, Set<string>>>();
  if (Array.isArray(execRows)) {
    for (const row of execRows as Array<{
      user_id?: string;
      task_id?: string;
      slot?: string;
      outcome?: string | null;
    }>) {
      const uid = typeof row.user_id === 'string' ? row.user_id : '';
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
      /** רק ביצוע מלא סוגר סלוט לתזכורת — partial/failed/skipped לא. */
      if (row.outcome && row.outcome !== 'completed') continue;
      if (!uid || !tid || !sl) continue;
      let byTask = todayExecutionsByUser.get(uid);
      if (!byTask) {
        byTask = new Map<string, Set<string>>();
        todayExecutionsByUser.set(uid, byTask);
      }
      let slots = byTask.get(tid);
      if (!slots) {
        slots = new Set<string>();
        byTask.set(tid, slots);
      }
      slots.add(sl);
    }
  }

  /** ביצועים אחרונים (21 יום) לחישוב רמות קושי */
  const sinceKey = jerusalemDateKey(new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentExecRows } = await admin
    .from('journey_task_executions')
    .select('user_id, task_id, date_key, slot, outcome')
    .gte('date_key', sinceKey)
    .limit(50000);

  const recentExecutionsByUser: RecentExecutionsByUser = new Map();
  if (Array.isArray(recentExecRows)) {
    for (const row of recentExecRows as Array<{
      user_id?: string;
      task_id?: string;
      date_key?: string;
      slot?: string;
      outcome?: string | null;
    }>) {
      const uid = typeof row.user_id === 'string' ? row.user_id : '';
      if (!uid || typeof row.task_id !== 'string' || typeof row.date_key !== 'string') continue;
      const list = recentExecutionsByUser.get(uid) ?? [];
      list.push({
        task_id: row.task_id,
        date_key: row.date_key,
        slot: typeof row.slot === 'string' ? row.slot : 'full_day',
        outcome: row.outcome ?? null,
      });
      recentExecutionsByUser.set(uid, list);
    }
  }

  const profileRows: Array<{
    id: string;
    ai_context?: Record<string, unknown> | null;
    onboarding_completed?: boolean | null;
    ai_check_in_times?: unknown;
    last_responded_at?: string | null;
    notification_count?: number | null;
    main_goal?: string | null;
    main_obstacle?: string | null;
    main_obstacle_detail?: string | null;
    streak_days?: number | null;
    engagement_status?: string | null;
    ai_system_prompt?: string | null;
    meal_count?: number | null;
    meal_schedule?: Array<{ time?: string | null; label?: string | null }> | null;
  }> = [];

  if (progressUserIds.length > 0) {
    /**
     * `last_responded_at` + `notification_count` נוספים ל-SELECT (migration
     * 000029). הם דרושים ל-(א) דילוג חכם אם המשתמש הגיב בשעות האחרונות,
     * (ב) הזרקת counter ל-LLM כדי להתאים טון למשתמש "ותיק".
     *
     * שדות churn (migration 000044): main_goal/main_obstacle/streak_days
     * ל-Identity Reconnection, engagement_status ל-persistence.
     */
    const { data: profiles, error: profErr } = await selectWithFallbacks(
      (select) => admin.from('profiles').select(select).in('id', progressUserIds.slice(0, 2000)),
      PROFILE_SELECTS
    );

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const row of profiles ?? []) {
      profileRows.push(row);
    }
  }

  /**
   * Map: userId → { lastRespondedAt, notificationCount } — מועבר ל-planner
   * כדי שיוכל לדלג על משתמשים פעילים ולהזריק counter ל-LLM.
   */
  const userResponseInfo = new Map<string, UserResponseInfo>();
  for (const row of profileRows) {
    userResponseInfo.set(row.id, {
      lastRespondedAt: row.last_responded_at ?? null,
      notificationCount:
        typeof row.notification_count === 'number' ? row.notification_count : 0,
    });
  }

  /**
   * TRUE last active per user — MAX של:
   *   1. profiles.last_active_at (כולל SW pings — לא מספיק)
   *   2. ai_interactions.created_at where role='user'  (כתיבה אמיתית בצ'אט)
   *   3. journey_task_executions.completed_at         (סימון משימה ב-DB)
   *
   * זה מבטל את הבאג של "Service Worker שמרים last_active_at והאפליקציה
   * זרוקה בכיס". כך אלמוג לא יעבור בטעות ל-INTRADAY GHOSTING כשהמשתמש
   * בכלל לא פתח את האפליקציה היום.
   */
  const lastActiveByUser = await fetchTrueLastActiveByUser(admin, progressUserIds, now);

  /**
   * 🔄 churn / re-engagement — בונים מפה פר משתמש: האם מופעל (feature flag +
   * rollout), אילו מהלכים כבר נשלחו, ומתי breakup, וקונטקסט זהות מ-onboarding.
   * כשהדגל כבוי — המפה ריקה והתנהגות זהה לקודם (תאימות לאחור מלאה).
   */
  const enabledReengagementIds = profileRows
    .filter((row) => isChurnReengagementEnabled(row.id))
    .map((row) => row.id);

  /**
   * 🧠 סיבת העזיבה האחרונה (Exit Survey) לכל משתמש מופעל — מוזרקת למהלך
   * welcome_back כדי שאלמוג "יזכור" למה היה קשה. מוגן: אם הטבלה לא קיימת
   * בסביבה מסוימת — ממשיכים בלי הסיבה (degradation עדין).
   */
  const lastChurnReasonByUser = new Map<string, string>();
  if (enabledReengagementIds.length > 0) {
    try {
      const { data: churnRows } = await admin
        .from('churn_feedback')
        .select('user_id, reason, created_at')
        .in('user_id', enabledReengagementIds.slice(0, 2000))
        .order('created_at', { ascending: false });
      for (const cr of (churnRows ?? []) as Array<{
        user_id: string;
        reason: string | null;
      }>) {
        if (cr.reason && !lastChurnReasonByUser.has(cr.user_id)) {
          lastChurnReasonByUser.set(cr.user_id, cr.reason);
        }
      }
    } catch {
      /* churn_feedback לא קיים בסביבה זו — welcome_back יעבוד בלי סיבה ספציפית */
    }
  }

  const reengagementByUser = new Map<string, ReengagementUserInfo>();
  for (const row of profileRows) {
    const enabled = isChurnReengagementEnabled(row.id);
    if (!enabled) continue;
    const reCtx = readReengagementContext(row.ai_context);
    const info: ReengagementUserInfo = {
      enabled,
      sentMoves: reCtx.sent_moves,
      breakupSentAt: reCtx.breakup_sent_at ?? null,
      /**
       * engagement_status מהריצה הקודמת — מזהה חזרה מהיעדרות (welcome_back).
       * נקרא *לפני* updateEngagementStatuses, ולכן עדיין משקף את המצב הקודם.
       */
      previousEngagementStatus: row.engagement_status ?? null,
      lastChurnReason: lastChurnReasonByUser.get(row.id) ?? null,
      identityContext: {
        mainGoal: goalToHebrew(row.main_goal),
        mainObstacle: obstacleToHebrew(row.main_obstacle, row.main_obstacle_detail),
        mainObstacleDetail: row.main_obstacle_detail ?? null,
        streakDays: typeof row.streak_days === 'number' ? row.streak_days : null,
        userWords: row.ai_system_prompt ?? null,
      },
    };
    reengagementByUser.set(row.id, info);
  }
  const reengagementInfo: ReengagementInfoByUser = reengagementByUser;

  const mealProfileByUser = new Map<
    string,
    { meal_count: number | null; meal_schedule?: Array<{ time?: string | null; label?: string | null }> | null }
  >();
  for (const row of profileRows) {
    mealProfileByUser.set(row.id, {
      meal_count: typeof row.meal_count === 'number' ? row.meal_count : null,
      meal_schedule: Array.isArray(row.meal_schedule) ? row.meal_schedule : null,
    });
  }

  const plan = await planHabitCheckpointTriggersWithChat(
    admin,
    (progressRows ?? []) as unknown as ProgressRow[],
    slot,
    now,
    todayExecutionsByUser,
    lastActiveByUser,
    userResponseInfo,
    recentExecutionsByUser,
    reengagementInfo,
    mealProfileByUser
  );

  /**
   * עדכון engagement_status persisted + reactivation reset (ספק 6.5).
   * רץ רק כשיש משתמשים שעבורם churn מופעל — חוסך writes כשהדגל כבוי.
   */
  let engagementUpdate = { updated: 0, reactivated: 0, errors: [] as string[] };
  if (!isDryRun && reengagementByUser.size > 0) {
    engagementUpdate = await updateEngagementStatuses(admin, {
      profileRows: profileRows.filter((r) => reengagementByUser.has(r.id)),
      lastActiveByUser,
      now,
    });
  }

  const userIds = [...new Set(plan.map((p) => p.userId))];
  const avoidIds = new Set<string>();
  const personalizedScheduleIds = new Set<string>();
  const hasPendingTasksByUser = new Map(
    plan.map((p) => [p.userId, p.payload.pendingTasks.length > 0])
  );

  if (userIds.length > 0) {
    const plannedIds = new Set(userIds);
    for (const row of profileRows) {
      if (!plannedIds.has(row.id)) continue;
      const id = row.id as string;
      const ctx = row.ai_context as Record<string, unknown> | null | undefined;
      if (isAvoidPushActive(ctx)) avoidIds.add(id);
      /**
       * משתמש "זמינות נמוכה היום" כבר לא חוסם תזכורות:
       *  - דרישת מוצר: 3 תזכורות ביום כשיש משימה לא בוצעת.
       *  - הטון/תוכן ההודעה ערב כבר מותאם דרך isCompassionOnly ב-send-almog-habit-checkpoint.
       *
       * גם משתמש עם זמנים אישיים מה-onboarding לא ידולג אם יש לו משימה פתוחה.
       * הזמנים האישיים מונעים כפילות רק עבור מגעים כלליים/הרגלים ללא משימת accepted.
       */
      if (
        row.onboarding_completed === true &&
        normalizeCheckInTimes(row.ai_check_in_times).length > 0 &&
        !hasPendingTasksByUser.get(id)
      ) {
        personalizedScheduleIds.add(id);
      }
    }
  }

  /**
   * Ghosted back-off (cadenceStage === 'ghosted', 14+ ימים): פעם אחת בשבוע.
   *
   * הלוגיקה אינה תלויה ב-slot: מספיק שנשלחה למשתמש Ghosted **כל** הודעה
   * מסוג `almog_habit_checkpoint` ב-7 הימים האחרונים — כל ה-slots הבאים
   * ידלגו אוטומטית עד שהשבוע יחלוף.
   *
   * שאר השלבים (dormant_early/withdrawing/extended_absence) מקבלים פילטור
   * תדירות דרך allowedSlotsForCadenceStage כבר ב-planHabitCheckpointTriggers —
   * אין צורך ב-cooldown נוסף כי כל שלב מסנן slots לתדירות הנכונה.
   */
  /**
   * ה-cooldown חל *רק* על מגעי נוכחות (`notifyMode==='reinforce'`). משתמש עם
   * משימה/הרגל פתוח שלא בוצע מקבל 3 תזכורות ביום *תמיד* (דרישת מוצר), גם אם
   * סווג ghosted — למשל מי שגולש באפליקציה אבל לא מדבר בצ'אט ולא מסמן ביצוע,
   * כך ש-fetchTrueLastActiveByUser רואה אותו דורמנטי. בלי הסינון הזה משתמש
   * כזה היה מקבל תזכורת אחת בשבוע בלבד על משימה פתוחה.
   */
  const ghostedIds = plan
    .filter((p) => p.payload.cadenceStage === 'ghosted' && p.payload.notifyMode === 'reinforce')
    .map((p) => p.userId);
  const ghostedWeeklyCooldownIds = new Set<string>();

  if (ghostedIds.length > 0) {
    const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentGhostedNotifications } = await admin
      .from('notifications')
      .select('user_id, metadata, created_at')
      .in('user_id', ghostedIds.slice(0, 2000))
      .eq('type', 'ai_message')
      .gte('created_at', weekAgoIso)
      .order('created_at', { ascending: false })
      .limit(4000);

    if (Array.isArray(recentGhostedNotifications)) {
      for (const row of recentGhostedNotifications as Array<{
        user_id?: string;
        metadata?: Record<string, unknown> | null;
      }>) {
        const source = typeof row.metadata?.source === 'string' ? row.metadata.source : '';
        if (source === 'almog_habit_checkpoint' && typeof row.user_id === 'string') {
          ghostedWeeklyCooldownIds.add(row.user_id);
        }
      }
    }
  }

  const eligible = plan
    .filter(
      (p) =>
        !avoidIds.has(p.userId) &&
        !personalizedScheduleIds.has(p.userId) &&
        !ghostedWeeklyCooldownIds.has(p.userId)
    )
    .slice(0, maxTriggers);
  const workflowBase = workflowPublicBaseUrl();
  const workflowUrl = `${workflowBase}/api/workflows/almog-habit-checkpoint`;

  if (isDryRun) {
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      slot,
      planned_users: plan.length,
      skipped_avoid_push: avoidIds.size,
      skipped_personalized_almog: personalizedScheduleIds.size,
      skipped_ghosted_weekly_cooldown: ghostedWeeklyCooldownIds.size,
      would_trigger: eligible.length,
      churn_enabled_users: reengagementByUser.size,
      workflow_url: workflowUrl,
      sample_user_ids: eligible.slice(0, 5).map((e) => e.userId),
      hint_he:
        'אם would_trigger>0 — ההגדרה תקינה. הסר dryRun=1 (או הפעל מ-Upstash Schedules) כדי לטרגר Workflows אמיתיים.',
    });
  }

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token: token!,
    ...(baseUrl ? { baseUrl } : {}),
  });

  let triggered = 0;
  const errors: string[] = [];

  for (const item of eligible) {
    try {
      await client.trigger({
        url: workflowUrl,
        body: JSON.stringify(item.payload),
        retries: 2,
        label: 'almog-habit-checkpoint',
      });
      triggered++;
    } catch (e) {
      errors.push(`${item.userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = {
    slot,
    planned_users: plan.length,
    skipped_avoid_push: avoidIds.size,
    skipped_personalized_almog: personalizedScheduleIds.size,
    skipped_ghosted_weekly_cooldown: ghostedWeeklyCooldownIds.size,
    workflow_triggers: triggered,
    eligible_after_avoid: eligible.length,
    errors_count: errors.length,
    workflow_url: workflowUrl,
    churn_enabled_users: reengagementByUser.size,
    engagement_status_updated: engagementUpdate.updated,
    engagement_reactivated: engagementUpdate.reactivated,
  };

  /**
   * נדפיס summary לקונסול כדי שיופיע ב-Vercel Logs לכל ריצה.
   * זה מאפשר לראות מיד מה הוחזר בלי לחפור ב-Upstash response body.
   */
  console.log('[habit-checkpoints CRON]', JSON.stringify(summary));
  if (errors.length > 0) {
    console.error('[habit-checkpoints CRON errors]', JSON.stringify(errors));
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    errors: errors.length ? errors : undefined,
  });
}

/**
 * Upstash Schedules קיימים במערכת מוגדרים כקריאת URL רגילה (GET). לכן GET
 * חייב להריץ את אותו cron, עם אותה שכבת auth, אחרת "Last run" נראה תקין אבל
 * לא נוצר אף Workflow של תזכורת.
 */
export async function GET(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}
