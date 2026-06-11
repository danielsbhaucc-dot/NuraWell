import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../lib/api/json-request';
import { consumeRateLimit, rateLimitResponse } from '../../../../../lib/api/rate-limit';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { jsonZodError } from '../../../../../lib/validation/zod-http';
import {
  MODEL_LAB_REGISTRY,
  makeLabBodyCompleter,
  resolveLabModel,
} from '../../../../../lib/ai/notify-model-lab';
import {
  habitCheckpointSlotSchema,
  type AlmogHabitCheckpointPayload,
  type HabitCheckpointSlot,
} from '../../../../../lib/workflows/almog-habit-checkpoint-payload';
import {
  collectPendingAcceptedTasks,
  collectUserJourneyHabits,
} from '../../../../../lib/workflows/habit-checkpoint-batch';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
} from '../../../../../lib/workflows/habit-checkpoint-eligibility';
import { sendAlmogHabitCheckpointNotification } from '../../../../../lib/workflows/send-almog-habit-checkpoint';

/**
 * 🧪 /api/v1/admin/notify-model-lab — מעבדת מודלים להתראות.
 *
 * שולח התראות *בדיוק כמו שהסלוט החי שולח* (אותו prompt, אותה טבלה, אותו push),
 * אבל:
 *   - בלתי-מוגבל: אין gate, אין dedupe (source='almog_model_lab' לא נכלל
 *     באינדקס הייחודי של הפרודקשן), אפשר לשלוח שוב ושוב.
 *   - לכל מודל מהרשימה (NVIDIA/DeepSeek/Kimi/MiniMax/GLM/Llama/Phi…) דרך DeepInfra.
 *   - dryRun: מנסח גוף בלי לכתוב ל-DB ובלי push — להשוואה מהירה.
 *
 * 🔒 לא נוגע בזרם החי: ה-CRON האמיתי ממשיך עם המודל הקיים ועם ה-gate הרגיל.
 *
 * הרשאה:
 *   - admin מחובר (profiles.role='admin') → userId = עצמו.
 *   - Bearer CRON_SECRET → userId מפורש (ops/curl).
 *
 * GET  — מחזיר את רשימת המודלים הזמינים + הוראות שימוש.
 * POST — שולח/מנסח. body: { models?, model?, all?, slot?, count?, dryRun?, userId? }.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LAB_SOURCE = 'almog_model_lab';

const bodySchema = z
  .object({
    /** מפתחות מהרישום, או "provider:model", או model גולמי של DeepInfra. */
    models: z.array(z.string().min(1)).max(20).optional(),
    model: z.string().min(1).optional(),
    /** true → כל המודלים ברישום. */
    all: z.boolean().optional(),
    slot: habitCheckpointSlotSchema.optional(),
    /** כמה התראות לשלוח לכל מודל (לבדיקת "בלתי מוגבל" / שונות ניסוח). */
    count: z.number().int().min(1).max(20).optional(),
    /** true → מנסח בלבד, בלי כתיבה ל-DB ובלי push. */
    dryRun: z.boolean().optional(),
    userId: z.string().uuid().optional(),
    bypassEligibility: z.boolean().optional(),
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
  const { data, error } = await admin
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
  return (data ?? []) as unknown as ProgressRow[];
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
  id: 'lab-fallback-habit',
  title: 'שתיית כוס מים',
  frequency: 'per_meal' as const,
};

export async function GET(request: Request) {
  /** רשימת מודלים + עזרה. admin/CRON בלבד. */
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization');
  const hasCronBearer = Boolean(secret && authHeader === `Bearer ${secret}`);
  if (!hasCronBearer) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (session.supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'admins only' }, { status: 403 });
    }
  }

  return NextResponse.json({
    ok: true,
    deepinfra_configured: Boolean(
      process.env.DEEPINFRA_API_KEY?.trim() || process.env.DEEPINFRA_TOKEN?.trim()
    ),
    env_hint: 'הגדר DEEPINFRA_API_KEY (או DEEPINFRA_TOKEN) ב-.env / Vercel.',
    models: MODEL_LAB_REGISTRY.map((m) => ({
      key: m.key,
      label: m.label,
      provider: m.provider,
      model: m.model,
      verified: m.verified ?? false,
    })),
    usage: {
      send_one: { method: 'POST', body: { model: 'kimi-k2.6', slot: 'morning' } },
      send_all: { method: 'POST', body: { all: true } },
      dry_run_all: { method: 'POST', body: { all: true, dryRun: true } },
      stress: { method: 'POST', body: { model: 'phi-4', count: 5 } },
      free_model: { method: 'POST', body: { model: 'deepinfra:deepseek-ai/DeepSeek-V3' } },
    },
    notes_he: [
      'dryRun=true → מנסח בלי לכתוב ל-DB ובלי push (השוואה מהירה בין מודלים).',
      'בלי dryRun → שולח התראת אמת שתופיע בפעמון/push, בלתי מוגבל (אין gate/dedupe).',
      'מודלים עם verified=false — אם מקבלים 404, עדכן את ה-slug ב-lib/ai/notify-model-lab.ts או שלח model גולמי.',
    ],
  });
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
        { error: 'userId required when authenticating with Bearer CRON_SECRET' },
        { status: 400 }
      );
    }
    targetUserId = body.userId;
  } else {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (session.supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'admins only' }, { status: 403 });
    }
    if (body.userId && body.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: cannot target another user' },
        { status: 403 }
      );
    }
    targetUserId = session.user.id;

    /** הגנת spam רכה — גם לאדמין; מספיק גבוה לבדיקה מרובת מודלים. */
    if (process.env.NODE_ENV === 'production') {
      const limited = await consumeRateLimit({
        key: targetUserId,
        namespace: 'notify-model-lab',
        limit: 120,
        windowSeconds: 3600,
      });
      if (!limited.ok) return rateLimitResponse(limited, 'יותר מדי בקשות למעבדת המודלים.');
    }
  }

  /** בחירת מודלים: all → כל הרישום; אחרת models[] / model; ברירת מחדל → כל הרישום. */
  const requestedKeys: string[] = body.all
    ? MODEL_LAB_REGISTRY.map((m) => m.key)
    : body.models && body.models.length > 0
      ? body.models
      : body.model
        ? [body.model]
        : MODEL_LAB_REGISTRY.map((m) => m.key);

  const resolvedModels = requestedKeys.map((k) => resolveLabModel(k));
  const unconfigured = resolvedModels.filter((m) => !m.configured);
  if (unconfigured.length === resolvedModels.length) {
    return NextResponse.json(
      {
        ok: false,
        error: 'no_provider_configured',
        hint_he:
          'אף ספק לא מוגדר עבור המודלים שנבחרו. ודא DEEPINFRA_API_KEY (או DEEPINFRA_TOKEN) ב-env.',
        missing_providers: [...new Set(unconfigured.map((m) => m.provider))],
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const slot = body.slot ?? slotFromJerusalemNow(now);
  const count = body.count ?? 1;
  const dryRun = body.dryRun ?? false;
  const bypassEligibility = body.bypassEligibility ?? true;
  const allowFallbackHabit = body.allowFallbackHabit ?? true;

  const admin = createAdminClient();

  let progressRows: ProgressRow[];
  try {
    progressRows = await fetchUserProgressRows(admin, targetUserId);
  } catch {
    return NextResponse.json({ error: 'journey_progress query failed' }, { status: 500 });
  }

  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const allHabits = collectUserJourneyHabits(progressRows);
  const filteredHabits = bypassEligibility
    ? allHabits
    : filterHabitsForSlot(allHabits, slot, weekday);

  const todayDoneByTask = new Map<string, Set<string>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayExecRows } = await admin
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
        hint_he:
          'אין הרגלים/משימות פתוחות. שלח allowFallbackHabit=true (ברירת מחדל) או bypassEligibility=true.',
        slot,
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

  type ModelResult = {
    key: string;
    label: string;
    provider: string;
    model: string;
    configured: boolean;
    runs: Array<{
      ok: boolean;
      ms: number;
      body?: string;
      notification_id?: unknown;
      error?: string;
    }>;
  };

  const results: ModelResult[] = [];

  for (const resolved of resolvedModels) {
    const entry: ModelResult = {
      key: resolved.key,
      label: resolved.label,
      provider: resolved.provider,
      model: resolved.model,
      configured: resolved.configured,
      runs: [],
    };

    if (!resolved.configured) {
      entry.runs.push({ ok: false, ms: 0, error: 'provider_not_configured' });
      results.push(entry);
      continue;
    }

    const completeBody = makeLabBodyCompleter(resolved);
    const modelTag = `${resolved.provider}:${resolved.model}`;

    for (let i = 0; i < count; i++) {
      const startedAt = Date.now();
      try {
        const sent = await sendAlmogHabitCheckpointNotification(admin, payload, {
          completeBody,
          modelTag,
          source: LAB_SOURCE,
          dryRun,
        });
        const inserted = sent.inserted as Record<string, unknown> | null;
        entry.runs.push({
          ok: true,
          ms: Date.now() - startedAt,
          body: sent.body,
          notification_id: inserted?.id,
        });
      } catch (e) {
        entry.runs.push({
          ok: false,
          ms: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    results.push(entry);
  }

  const totalRuns = results.reduce((acc, r) => acc + r.runs.length, 0);
  const okRuns = results.reduce((acc, r) => acc + r.runs.filter((x) => x.ok).length, 0);

  return NextResponse.json({
    ok: true,
    mode: dryRun ? 'dry_run' : 'sent',
    slot,
    checkpoint_date: dateKey,
    target_user_id: targetUserId,
    used_fallback_habit: usedFallback,
    pending_task_titles: pendingTasks.slice(0, 6).map((t) => t.title),
    models_count: results.length,
    runs_total: totalRuns,
    runs_ok: okRuns,
    results,
    hint_he: dryRun
      ? 'dryRun — לא נכתב כלום ל-DB. השווה את ה-body של כל מודל. כדי לשלוח באמת, הסר dryRun.'
      : 'נשלחו התראות אמת (source=almog_model_lab). הן יופיעו בפעמון/push בדיוק כמו הסלוט החי, בלי להפריע ל-CRON האמיתי.',
  });
}
