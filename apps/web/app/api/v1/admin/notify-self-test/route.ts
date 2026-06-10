import { NextResponse } from 'next/server';

import { createAdminClient } from '../../../../../lib/supabase/admin';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '../../../../../lib/api/rate-limit';
import {
  fetchTrueLastActiveByUser,
  planHabitCheckpointTriggers,
  type ProgressRow,
  type UserResponseInfo,
} from '../../../../../lib/workflows/habit-checkpoint-batch';
import { gateAlmogHabitCheckpoint } from '../../../../../lib/workflows/habit-checkpoint-gates';
import { sendAlmogHabitCheckpointNotification } from '../../../../../lib/workflows/send-almog-habit-checkpoint';
import { habitCheckpointSlotSchema } from '../../../../../lib/workflows/almog-habit-checkpoint-payload';
import { workflowPublicBaseUrl } from '../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const PROGRESS_SELECT = `
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
`;

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

/**
 * GET /api/v1/admin/notify-self-test?slot=morning&send=1
 *
 * כלי אבחון לאדמין: מריץ את *כל* שרשרת ההתראה עבור המשתמש המחובר עצמו,
 * ישירות (בלי Upstash Workflow), ומדווח בדיוק היכן השרשרת נשברת:
 *   1. כמה משימות פתוחות יש (planning).
 *   2. האם ה-planner מייצר התראה ל-slot הזה.
 *   3. האם ה-gate חוסם (avoid_push / already_sent / touch_fatigue).
 *   4. עם send=1 — שולח התראת אמת inline ומחזיר את ה-id (כדי לראות בפעמון).
 *
 * הרשאה: admin בלבד (profiles.role).
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 60, windowSeconds: 60 },
    { limit: 500, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await admin
    .from('profiles')
    .select('role, last_responded_at, notification_count, meal_count, meal_schedule, ai_context')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'admins only' }, { status: 403 });
  }

  const userId = auth.user.id;
  const url = new URL(request.url);
  const now = new Date();
  const slotRaw = url.searchParams.get('slot');
  const slot = slotRaw
    ? habitCheckpointSlotSchema.safeParse(slotRaw).success
      ? (slotRaw as 'morning' | 'midday' | 'evening')
      : deriveSlotFromJerusalemHour(now)
    : deriveSlotFromJerusalemHour(now);
  const doSend = url.searchParams.get('send') === '1';

  /** 1) progress rows של המשתמש בלבד */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows, error: progErr } = await admin
    .from('journey_progress')
    .select(PROGRESS_SELECT)
    .eq('user_id', userId);

  if (progErr) {
    return NextResponse.json(
      { stage: 'fetch_progress', error: progErr.message },
      { status: 500 }
    );
  }

  /** 2) ביצועי היום של המשתמש (לסינון סלוטים שכבר נסגרו) */
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: execRows } = await admin
    .from('journey_task_executions')
    .select('task_id, slot, outcome')
    .eq('user_id', userId)
    .eq('date_key', todayKey)
    .limit(2000);

  const todayExecutionsByUser = new Map<string, Map<string, Set<string>>>();
  if (Array.isArray(execRows)) {
    const byTask = new Map<string, Set<string>>();
    for (const r of execRows as Array<{ task_id?: string; slot?: string; outcome?: string | null }>) {
      if (r.outcome && r.outcome !== 'completed') continue;
      if (typeof r.task_id !== 'string' || typeof r.slot !== 'string') continue;
      const set = byTask.get(r.task_id) ?? new Set<string>();
      set.add(r.slot);
      byTask.set(r.task_id, set);
    }
    if (byTask.size > 0) todayExecutionsByUser.set(userId, byTask);
  }

  /** 3) last-active אמיתי (צ'אט + executions + last_engaged_at) */
  const lastActiveByUser = await fetchTrueLastActiveByUser(admin, [userId], now);

  const userResponseInfo = new Map<string, UserResponseInfo>([
    [
      userId,
      {
        lastRespondedAt: (roleRow.last_responded_at as string | null) ?? null,
        notificationCount:
          typeof roleRow.notification_count === 'number' ? roleRow.notification_count : 0,
      },
    ],
  ]);

  const mealProfileByUser = new Map([
    [
      userId,
      {
        meal_count: typeof roleRow.meal_count === 'number' ? roleRow.meal_count : null,
        meal_schedule: Array.isArray(roleRow.meal_schedule) ? roleRow.meal_schedule : null,
      },
    ],
  ]);

  /** 4) הרצת ה-planner — בדיוק כמו ב-cron, אבל למשתמש אחד */
  const plan = planHabitCheckpointTriggers(
    (progressRows ?? []) as unknown as ProgressRow[],
    slot,
    now,
    todayExecutionsByUser,
    lastActiveByUser,
    userResponseInfo,
    new Map(),
    new Map(),
    mealProfileByUser
  );

  const myItem = plan.find((p) => p.userId === userId) ?? null;
  const lastActiveIso = lastActiveByUser.get(userId) ?? null;

  const diagnostics: Record<string, unknown> = {
    slot,
    today_key: todayKey,
    progress_rows: (progressRows ?? []).length,
    last_active_at: lastActiveIso,
    planned: Boolean(myItem),
    infra: {
      workflow_public_base_url: workflowPublicBaseUrl(),
      has_qstash_token: Boolean(process.env.QSTASH_TOKEN?.trim()),
    },
  };

  if (!myItem) {
    /** למה אין תכנון? נחשוף את מצב המשימות כדי שתבין */
    const pendingDump: Array<{ step: string; accepted_open: string[] }> = [];
    for (const row of (progressRows ?? []) as Array<Record<string, unknown>>) {
      const steps = row.journey_steps as { title?: string } | null;
      const ts = (row.task_statuses ?? {}) as Record<string, { status?: string; execution_done?: boolean }>;
      const open = Object.entries(ts)
        .filter(([, v]) => v?.status === 'accepted' && v?.execution_done !== true)
        .map(([k]) => k);
      pendingDump.push({ step: steps?.title ?? '—', accepted_open: open });
    }
    return NextResponse.json({
      ok: true,
      result: 'no_plan',
      hint_he:
        'ה-planner לא מצא משימה/הרגל פתוח ל-slot הזה. בדוק accepted_open: אם ריק — אין משימה שסומנה "שלי" שעדיין פתוחה; אם מלא — ייתכן שכבר בוצעה היום או שה-slot לא תואם.',
      ...diagnostics,
      task_statuses_open: pendingDump,
    });
  }

  /** 5) ה-gate (אותה לוגיקה כמו ב-Workflow) */
  const gate = await gateAlmogHabitCheckpoint(
    admin,
    userId,
    myItem.payload.checkpointDate,
    myItem.payload.slot,
    myItem.payload.notifyMode
  );

  if (!gate.ok) {
    return NextResponse.json({
      ok: true,
      result: 'gated',
      gate_reason: gate.reason,
      hint_he:
        gate.reason === 'already_sent_this_slot'
          ? 'כבר נשלחה התראה ל-slot+תאריך הזה. נסה slot אחר או יום אחר, או מחק את ההתראה הקיימת.'
          : gate.reason === 'avoid_push'
            ? 'avoid_push פעיל ב-ai_context — המשתמש ביקש פחות דחיפה. הסר אותו כדי לקבל התראות.'
            : 'touch_fatigue — כבר היו יותר מדי מגעים היום.',
      ...diagnostics,
      payload_preview: {
        notify_mode: myItem.payload.notifyMode,
        pending_tasks: myItem.payload.pendingTasks.map((t) => t.title),
        cadence_stage: myItem.payload.cadenceStage,
      },
    });
  }

  if (!doSend) {
    return NextResponse.json({
      ok: true,
      result: 'would_send',
      hint_he:
        'התכנון וה-gate תקינים — התראה *הייתה* נשלחת. הוסף &send=1 ל-URL כדי לשלוח התראת אמת עכשיו ולראות אותה בפעמון.',
      ...diagnostics,
      payload_preview: {
        notify_mode: myItem.payload.notifyMode,
        pending_tasks: myItem.payload.pendingTasks.map((t) => t.title),
        cadence_stage: myItem.payload.cadenceStage,
        reengagement_move: myItem.payload.reengagementMove ?? 'none',
      },
    });
  }

  /** 6) שליחה אמיתית inline (בלי Upstash) — מוכיח DB insert + LLM */
  try {
    const sent = await sendAlmogHabitCheckpointNotification(admin, myItem.payload);
    return NextResponse.json({
      ok: true,
      result: 'sent',
      hint_he:
        'התראה נוצרה ונכנסה לטבלה ישירות. אם אתה רואה אותה בפעמון אבל ה-cron הרגיל לא מגיע — הבעיה היא ב-Upstash Workflow hop (QSTASH_TOKEN / WORKFLOW_PUBLIC_BASE_URL / ה-Schedule), לא בקוד ההתראה.',
      ...diagnostics,
      notification: sent.inserted,
      body_preview: sent.body,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        result: 'send_failed',
        error: e instanceof Error ? e.message : String(e),
        hint_he:
          'יצירת ההתראה עצמה נכשלה (LLM/DB). זה ההסבר לכך שלא קיבלת התראות — ההודעה כאן היא שורש הבעיה.',
        ...diagnostics,
      },
      { status: 500 }
    );
  }
}
