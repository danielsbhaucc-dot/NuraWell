import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import {
  isDailyAvailabilityLowToday,
  type AiUserContext,
} from '../../../../../../lib/ai/memory';
import { normalizeCheckInTimes } from '../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { habitCheckpointSlotSchema } from '../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import {
  fetchTrueLastActiveByUser,
  planHabitCheckpointTriggersWithChat,
} from '../../../../../../lib/workflows/habit-checkpoint-batch';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function runHabitCheckpointCron(request: Request) {
  const url = new URL(request.url);
  const slotRaw = url.searchParams.get('slot');
  if (!slotRaw) {
    return NextResponse.json(
      { error: 'חסר query ?slot=morning|midday|evening — קראו 3 פעמים ביום עם ערך מתאים' },
      { status: 400 }
    );
  }

  const slotParsed = habitCheckpointSlotSchema.safeParse(slotRaw);
  if (!slotParsed.success) {
    return NextResponse.json({ error: 'slot לא תקין (morning|midday|evening)' }, { status: 400 });
  }
  const slot = slotParsed.data;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows, error: progErr } = await (admin as any).from('journey_progress').select(
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
  const { data: execRows } = await (admin as any)
    .from('journey_task_executions')
    .select('user_id, task_id, slot')
    .eq('date_key', todayKey)
    .limit(20000);

  const todayExecutionsByUser = new Map<string, Map<string, Set<string>>>();
  if (Array.isArray(execRows)) {
    for (const row of execRows as Array<{ user_id?: string; task_id?: string; slot?: string }>) {
      const uid = typeof row.user_id === 'string' ? row.user_id : '';
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
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

  const profileRows: Array<{
    id: string;
    ai_context?: Record<string, unknown> | null;
    onboarding_completed?: boolean | null;
    ai_check_in_times?: unknown;
  }> = [];

  if (progressUserIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles, error: profErr } = await (admin as any)
      .from('profiles')
      .select('id, ai_context, onboarding_completed, ai_check_in_times')
      .in('id', progressUserIds.slice(0, 2000));

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const row of profiles ?? []) {
      profileRows.push(row);
    }
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

  const plan = await planHabitCheckpointTriggersWithChat(
    admin,
    progressRows ?? [],
    slot,
    now,
    todayExecutionsByUser,
    lastActiveByUser
  );

  const userIds = [...new Set(plan.map((p) => p.userId))];
  const avoidIds = new Set<string>();
  const lowAvailabilityIds = new Set<string>();
  const personalizedScheduleIds = new Set<string>();

  if (userIds.length > 0) {
    const plannedIds = new Set(userIds);
    for (const row of profileRows) {
      if (!plannedIds.has(row.id)) continue;
      const id = row.id as string;
      const ctx = row.ai_context as Record<string, unknown> | null | undefined;
      if (isAvoidPushActive(ctx)) avoidIds.add(id);
      if (
        slot !== 'evening' &&
        isDailyAvailabilityLowToday(
          (ctx as AiUserContext | null | undefined)?.daily_availability
        )
      ) {
        lowAvailabilityIds.add(id);
      }
      if (
        row.onboarding_completed === true &&
        normalizeCheckInTimes(row.ai_check_in_times).length > 0
      ) {
        personalizedScheduleIds.add(id);
      }
    }
  }

  /**
   * Ghosted back-off (nudgeLevel === 3): פעם אחת בשבוע, פעם אחת לכלל ה-3 חלונות.
   *
   * הלוגיקה אינה תלויה ב-slot: מספיק שנשלחה למשתמש Ghosted **כל** הודעה
   * מסוג `almog_habit_checkpoint` ב-7 הימים האחרונים — כל ה-slots הבאים
   * (midday, evening, וגם הימים שאחרי) ידלגו אוטומטית עד שהשבוע יחלוף.
   * כך לא תיווצר state corruption: אם morning שלח, midday אותו יום + 6
   * הימים הבאים יראו את אותה הודעה ויסמנו cooldown.
   */
  const ghostedIds = plan
    .filter((p) => p.payload.nudgeLevel === 3)
    .map((p) => p.userId);
  const ghostedWeeklyCooldownIds = new Set<string>();

  if (ghostedIds.length > 0) {
    const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentGhostedNotifications } = await (admin as any)
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
        !lowAvailabilityIds.has(p.userId) &&
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
      skipped_daily_low_availability: lowAvailabilityIds.size,
      skipped_personalized_almog: personalizedScheduleIds.size,
      skipped_ghosted_weekly_cooldown: ghostedWeeklyCooldownIds.size,
      would_trigger: eligible.length,
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
    skipped_daily_low_availability: lowAvailabilityIds.size,
    skipped_personalized_almog: personalizedScheduleIds.size,
    skipped_ghosted_weekly_cooldown: ghostedWeeklyCooldownIds.size,
    workflow_triggers: triggered,
    eligible_after_avoid: eligible.length,
    errors_count: errors.length,
    workflow_url: workflowUrl,
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
 * POST בלבד. GET נסגר כדי למנוע טריגר לא-מכוון מ-prefetch/CDN/monitoring שמטרגר
 * אלפי Workflows ועלות. הסקיידולים ב-Upstash QStash משתמשים ב-POST.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}
