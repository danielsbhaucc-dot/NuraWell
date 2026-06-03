import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../../../lib/api/json-request';
import { consumeRateLimit, rateLimitResponse } from '../../../../../../../lib/api/rate-limit';
import { requireApiSession } from '../../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../../lib/supabase/admin';
import { jsonZodError } from '../../../../../../../lib/validation/zod-http';
import {
  habitCheckpointSlotSchema,
  type AlmogHabitCheckpointPayload,
  type HabitCheckpointSlot,
} from '../../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import {
  collectPendingAcceptedTasks,
  collectUserJourneyHabits,
} from '../../../../../../../lib/workflows/habit-checkpoint-batch';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
} from '../../../../../../../lib/workflows/habit-checkpoint-eligibility';
import { gateAlmogHabitCheckpoint } from '../../../../../../../lib/workflows/habit-checkpoint-gates';
import { sendAlmogHabitCheckpointNotification } from '../../../../../../../lib/workflows/send-almog-habit-checkpoint';

/**
 * Endpoint לדיבוג של תזרים ה-Habit Checkpoint — מריץ סינכרונית את אותו קוד שה-CRON
 * הרגיל מריץ דרך Workflow ב-QStash, **בלי המתנה לחלון הזמן הבא ובלי המתנה ל-QStash**.
 *
 * שימושים מותרים:
 *  1) משתמש מחובר → בדיקה עצמית של ההתראה שלו (userId = session.id).
 *  2) Bearer CRON_SECRET → טריגר על-userId כלשהו לבדיקת dev/ops.
 *
 * ברירות מחדל מותאמות לבדיקה חוזרת:
 *  - bypassGate = true → אפשר לבדוק שוב ושוב באותו slot/יום (gate הרגיל היה חוסם).
 *  - bypassEligibility = true → לא מסנן הרגלים לפי slot/יום בשבוע — שולח על כל ההרגלים
 *    הקיימים. שולח גם אם אין הרגלים תואמים לחלון הנוכחי.
 *  - slot = נגזר אוטומטית משעת ירושלים (פחות נדרש להעביר אותו ידנית).
 *
 * הגנות:
 *  - ללא Bearer — userId חייב להיות זהה לסשן (משתמש לא יכול להריץ עבור אחר).
 *  - אין כפילויות ב-DB: כפי שמיושם, כל קריאה כותבת notification חדש. למשתמש זה זה
 *    בסדר כי הוא הזמין את זה. ה-CRON האמיתי עדיין רץ מול ה-gate הרגיל.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    slot: habitCheckpointSlotSchema.optional(),
    userId: z.string().uuid().optional(),
    bypassGate: z.boolean().optional(),
    bypassEligibility: z.boolean().optional(),
    /** אם אין למשתמש הרגלים במסע — נשתמש בפלייסהולדר לבדיקה. */
    allowFallbackHabit: z.boolean().optional(),
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

type ProgressRow = {
  user_id: string;
  updated_at: string;
  is_completed: boolean | null;
  task_statuses: unknown;
  habits_progress: unknown;
  journey_steps: {
    title: string | null;
    habits: unknown;
    tasks: unknown;
    journey_stations: unknown;
  } | null;
};

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

function stationTitleFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const t =
      raw[0] && typeof raw[0] === 'object' ? (raw[0] as { title?: string }).title : undefined;
    return typeof t === 'string' ? t : null;
  }
  if (typeof raw === 'object' && 'title' in raw) {
    const t = (raw as { title?: unknown }).title;
    return typeof t === 'string' ? t : null;
  }
  return null;
}

function pickDisplayRow(rows: ProgressRow[]): ProgressRow | null {
  const incomplete = [...rows]
    .filter((r) => !r.is_completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (incomplete[0]) return incomplete[0];
  const sorted = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return sorted[0] ?? null;
}

const FALLBACK_HABIT = {
  id: 'debug-fallback-habit',
  title: 'שתיית כוס מים',
  frequency: 'per_meal' as const,
};

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  /** אימות חלופי: Bearer CRON_SECRET — מאפשר curl/ops עם userId מפורש */
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization');
  const hasCronBearer = Boolean(secret && authHeader === `Bearer ${secret}`);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value ?? {});
  if (!parsed.success) return jsonZodError(parsed.error, 'Invalid request body');
  const body = parsed.data;

  let targetUserId: string;
  let isAdminCaller = false;
  if (hasCronBearer) {
    if (!body.userId) {
      return NextResponse.json(
        { error: 'userId required when authenticating with Bearer CRON_SECRET' },
        { status: 400 }
      );
    }
    targetUserId = body.userId;
  } else {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    if (body.userId && body.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: cannot trigger test notification for another user' },
        { status: 403 }
      );
    }
    targetUserId = session.user.id;

    /** ניתן ל-admin מתחבר מאזור Ops את אותן יכולות bypass כמו ל-cron. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (session.supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    isAdminCaller = profile?.role === 'admin';

    if (process.env.NODE_ENV === 'production') {
      const limited = await consumeRateLimit({
        key: targetUserId,
        namespace: 'habit-checkpoint-test',
        limit: 8,
        windowSeconds: 3600,
      });
      if (!limited.ok) {
        return rateLimitResponse(
          limited,
          'יותר מדי בקשות לבדיקת התראה. נסו שוב מאוחר יותר.'
        );
      }
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const now = new Date();
  const slot = body.slot ?? slotFromJerusalemNow(now);
  /**
   * 🛡️ bypassGate / bypassEligibility — flags חזקים שמוציאים את ההודעה
   * מ-state-machine הרגיל. מאפשרים אותם רק ל-cron secret או admin
   * בפרודקשן; משתמש רגיל ב-prod לא יכול לעקוף gate ויצירת spam.
   */
  const allowBypass = !isProduction || hasCronBearer || isAdminCaller;
  const bypassGate = (body.bypassGate ?? !isProduction) && allowBypass;
  const bypassEligibility = (body.bypassEligibility ?? !isProduction) && allowBypass;
  const allowFallbackHabit = body.allowFallbackHabit ?? true;

  const admin = createAdminClient();

  let progressRows: ProgressRow[];
  try {
    progressRows = await fetchUserProgressRows(admin, targetUserId);
  } catch (e) {
    console.error('[habit-checkpoint test] journey_progress query failed', e);
    return NextResponse.json(
      { error: 'journey_progress query failed' },
      { status: 500 }
    );
  }

  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const allHabits = collectUserJourneyHabits(progressRows);
  const filteredHabits = bypassEligibility
    ? allHabits
    : filterHabitsForSlot(allHabits, slot, weekday);

  /** טוען ביצועי-סלוטים של היום עבור המשתמש — כדי שמשימה חוזרת שכבר סומנה לא תיכלל. */
  const todayDoneByTask = new Map<string, Set<string>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayExecRows } = await (admin as any)
    .from('journey_task_executions')
    .select('task_id, slot')
    .eq('user_id', targetUserId)
    .eq('date_key', dateKey)
    .limit(200);
  if (Array.isArray(todayExecRows)) {
    for (const row of todayExecRows as Array<{ task_id?: string; slot?: string }>) {
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
      if (!tid || !sl) continue;
      const cur = todayDoneByTask.get(tid) ?? new Set<string>();
      cur.add(sl);
      todayDoneByTask.set(tid, cur);
    }
  }
  const pendingTasks = collectPendingAcceptedTasks(progressRows, {
    todayDoneByTask,
    cronSlot: slot,
    jerusalemWeekday: weekday,
  });

  let payloadHabits: AlmogHabitCheckpointPayload['habits'] = filteredHabits.map((h) => ({
    id: h.id,
    title: h.title,
    frequency: h.frequency,
  }));
  let usedFallback = false;
  if (payloadHabits.length === 0 && pendingTasks.length === 0 && allowFallbackHabit) {
    payloadHabits = [FALLBACK_HABIT];
    usedFallback = true;
  }

  if (payloadHabits.length === 0 && pendingTasks.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'nothing_to_send',
        details:
          'למשתמש אין הרגלים תואמי חלון ואין משימות פתוחות. שלח allowFallbackHabit=true או bypassEligibility=true לבדיקת תזרים.',
        slot,
        weekday_jerusalem: weekday,
        all_habits_count: allHabits.length,
        pending_tasks_count: 0,
      },
      { status: 200 }
    );
  }

  const display = pickDisplayRow(progressRows);
  const stepTitle = display?.journey_steps?.title?.trim() ?? null;
  const stationTitle = stationTitleFromJoin(display?.journey_steps?.journey_stations);

  const payload: AlmogHabitCheckpointPayload = {
    userId: targetUserId,
    slot,
    checkpointDate: dateKey,
    notifyMode: 'remind',
    habits: payloadHabits,
    pendingTasks: pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stepTitle: t.stepTitle,
    })),
    completedTodayHabits: [],
    completedTodayTasks: [],
    stepTitle,
    stationTitle,
    nudgeLevel: 0,
    daysSinceLastActive: 0,
    completionStatus: 'none',
    cadenceStage: 'active',
    urgencyLevel: slot === 'evening' ? 'friendly_nudge' : 'gentle',
    notificationCount: 0,
  };

  if (!bypassGate) {
    const gate = await gateAlmogHabitCheckpoint(admin, targetUserId, dateKey, slot);
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'blocked_by_gate',
          reason: gate.reason,
          hint_he:
            gate.reason === 'avoid_push'
              ? 'המשתמש סימן avoid_push=true בהגדרות אלמוג. שנה ב-/settings/almog או שלח bypassGate=true.'
              : 'התראה לאותו slot/יום כבר נשלחה. שלח bypassGate=true (ברירת מחדל) כדי לדרוס.',
          slot,
          checkpoint_date: dateKey,
        },
        { status: 200 }
      );
    }
  }

  try {
    const result = await sendAlmogHabitCheckpointNotification(admin, payload);

    /**
     * אבחון אחרי INSERT — שולפים את 5 ההתראות האחרונות של המשתמש דרך admin
     * (עוקפים RLS) כדי לוודא שההתראה באמת נשמרה ב-DB ולא נמחקת אחרי INSERT.
     * אם כאן רואים את הרשומה אבל ב-UI לא — הבעיה ב-RLS / Frontend / Session.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentRows } = await (admin as any)
      .from('notifications')
      .select('id, type, title, archived_at, is_read, is_sent, created_at, metadata')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(5);

    const inserted = result.inserted as Record<string, unknown> | null;

    return NextResponse.json({
      ok: true,
      mode: 'sync_debug',
      slot,
      checkpoint_date: dateKey,
      weekday_jerusalem: weekday,
      gate_bypassed: bypassGate,
      eligibility_bypassed: bypassEligibility,
      used_fallback_habit: usedFallback,
      target_user_id: targetUserId,
      all_habits_count: allHabits.length,
      eligible_habits_count: filteredHabits.length,
      sent_habits_count: payloadHabits.length,
      pending_tasks_count: pendingTasks.length,
      pending_task_titles: pendingTasks.slice(0, 6).map((t) => t.title),
      notification_body: result.body,
      inserted_notification: inserted
        ? {
            id: inserted.id,
            archived_at: inserted.archived_at,
            is_read: inserted.is_read,
            is_sent: inserted.is_sent,
            created_at: inserted.created_at,
          }
        : null,
      recent_notifications_count: Array.isArray(recentRows) ? recentRows.length : 0,
      recent_notifications: Array.isArray(recentRows)
        ? recentRows.map((r: Record<string, unknown>) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            archived_at: r.archived_at,
            is_read: r.is_read,
            created_at: r.created_at,
          }))
        : [],
      hint_he:
        'אם inserted_notification.id מופיע ב-recent_notifications וגם בפעמון — הזרימה תקינה. אם הוא ב-DB אבל לא בפעמון — בעיית RLS/Frontend.',
    });
  } catch (e) {
    console.error('[habit-checkpoint test] send_failed', e);
    /**
     * אל תחשוף `e.message`/`e.stack` ב-production. שומרים אותם בלוגים
     * אבל מחזירים ללקוח רק error code שמספיק לדיבוג ב-UI.
     */
    return NextResponse.json(
      {
        ok: false,
        error: 'send_failed',
        slot,
        checkpoint_date: dateKey,
        target_user_id: targetUserId,
        ...(process.env.NODE_ENV !== 'production' && e instanceof Error
          ? { debug: { message: e.message, stack: e.stack } }
          : {}),
      },
      { status: 500 }
    );
  }
}
