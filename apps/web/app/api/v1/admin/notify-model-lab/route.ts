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
import { sendAlmogHabitCheckpointNotification } from '../../../../../lib/workflows/send-almog-habit-checkpoint';
import {
  habitCheckpointSlotSchema,
  type AlmogHabitCheckpointPayload,
  type HabitCheckpointSlot,
} from '../../../../../lib/workflows/almog-habit-checkpoint-payload';
import type { EmpathyModelOverride } from '../../../../../lib/ai/empathy-notify-completion';

/**
 * 🧪 כלי בדיקה זמני (admin) — מעבדת מודלים להתראות.
 *
 * יוצר התראת אמת *בדיוק כמו ה-CRON* (אותו planner, אותו prompt, אותו insert),
 * אבל:
 *   1. בלי gate — לא מוגבל, אפשר להריץ שוב ושוב.
 *   2. עם בורר מודל — מנסח את ההתראה דרך המודל שנבחר בלבד (override).
 *
 * ⚠️ זמני. למחיקה אחרי שבוחרים מודל. אינו נוגע בזרימת ה-CRON העובדת.
 */

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

const MODEL_MAP: Record<string, { label: string; override: EmpathyModelOverride }> = {
  claude: { label: 'Claude Sonnet 4.6', override: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' } },
  gemini: { label: 'Gemini 3.5 Flash', override: { provider: 'openrouter', model: 'google/gemini-3.5-flash' } },
  gpt5mini: { label: 'GPT-5 mini', override: { provider: 'openrouter', model: 'openai/gpt-5-mini' } },
  qwen: { label: 'Qwen 3.7 Plus', override: { provider: 'openrouter', model: 'qwen/qwen3.7-plus' } },
  deepseek: { label: 'DeepSeek', override: { provider: 'deepseek', model: 'deepseek-chat' } },
  llama_groq: {
    label: 'LLaMA 4 Scout (Groq via OpenRouter)',
    override: { provider: 'openrouter', model: 'meta-llama/llama-4-scout' },
  },
};

function deriveSlotFromJerusalemHour(now: Date): HabitCheckpointSlot {
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

const SLOT_LABEL_HE: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  evening: 'ערב',
};

/**
 * Body: { model: string (key מתוך MODEL_MAP), slot?: 'morning'|'midday'|'evening' }
 * הרשאה: admin בלבד.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 30, windowSeconds: 60 },
    { limit: 300, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await admin
    .from('profiles')
    .select('role, last_responded_at, notification_count, meal_count, meal_schedule')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'admins only' }, { status: 403 });
  }

  let body: { model?: string; slot?: string } = {};
  try {
    body = (await request.json()) as { model?: string; slot?: string };
  } catch {
    /* empty body ok */
  }

  const modelKey = (body.model ?? 'gpt5mini').trim();
  const modelEntry = MODEL_MAP[modelKey];
  if (!modelEntry) {
    return NextResponse.json(
      { error: `unknown model "${modelKey}"`, available: Object.keys(MODEL_MAP) },
      { status: 400 }
    );
  }

  const userId = auth.user.id;
  const now = new Date();
  const slot = body.slot && habitCheckpointSlotSchema.safeParse(body.slot).success
    ? (body.slot as HabitCheckpointSlot)
    : deriveSlotFromJerusalemHour(now);

  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  /** 1) planner — בונה payload אמיתי כמו ה-CRON */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows } = await admin
    .from('journey_progress')
    .select(PROGRESS_SELECT)
    .eq('user_id', userId);

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

  /**
   * 2) payload — מעדיף את ה-payload האמיתי מה-planner (כמו CRON). אם אין משימה
   * פתוחה כרגע, בונים payload סינתטי מינימלי כדי שהבדיקה תהיה *לא מוגבלת*.
   */
  const payload: AlmogHabitCheckpointPayload = myItem
    ? myItem.payload
    : {
        userId,
        slot,
        checkpointDate: todayKey,
        notifyMode: 'remind',
        habits: [],
        pendingTasks: [
          {
            id: 'model-lab-synthetic',
            title: 'המשימה היומית שלך',
            scheduleLabel: 'יומי',
            pendingSlotLabels: [SLOT_LABEL_HE[slot]],
          },
        ],
        completedTodayHabits: [],
        completedTodayTasks: [],
        nudgeLevel: 0,
        daysSinceLastActive: 0,
        completionStatus: 'none',
        cadenceStage: 'active',
        urgencyLevel: 'gentle',
        notificationCount:
          typeof roleRow.notification_count === 'number' ? roleRow.notification_count : 0,
      };

  /** 3) שליחה אמיתית עם override המודל — בלי gate (לא מוגבל) */
  try {
    const sent = await sendAlmogHabitCheckpointNotification(admin, payload, {
      modelOverride: modelEntry.override,
    });
    return NextResponse.json({
      ok: true,
      result: 'sent',
      model_key: modelKey,
      model_label: modelEntry.label,
      model_id: modelEntry.override.model,
      provider: modelEntry.override.provider,
      slot,
      used_synthetic_payload: !myItem,
      title: (sent.inserted as { title?: string } | null)?.title ?? null,
      body: sent.body,
      notification_id: (sent.inserted as { id?: string } | null)?.id ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        result: 'send_failed',
        model_key: modelKey,
        model_label: modelEntry.label,
        model_id: modelEntry.override.model,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
