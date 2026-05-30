/**
 * סימון ביצוע משימה מהצ'אט:
 *  - one_time → execution_done ב-journey_progress
 *  - recurring → שורה ב-journey_task_executions (slot + date_key)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import {
  currentSlotForSchedule,
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
} from '../journey/task-schedule';

function expectedSlotCount(schedule: JourneyTaskSchedule, timesPerDay: number): number {
  return slotsForSchedule(schedule, timesPerDay).length;
}

export type PendingAcceptedTask = {
  id: string;
  title: string;
  stepId: string;
  stepTitle: string | null;
  schedule: JourneyTaskSchedule;
  times_per_day: number;
};

type ParsedTaskMeta = {
  id: string;
  title: string;
  schedule: JourneyTaskSchedule;
  times_per_day: number;
};

const JOURNEY_PROGRESS_SELECT = `
  user_id,
  step_id,
  updated_at,
  is_completed,
  task_statuses,
  journey_steps (
    title,
    tasks
  )
`;

function parseTasksMeta(raw: unknown): ParsedTaskMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTaskMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    const { schedule, times_per_day } = resolveTaskSchedule({
      schedule: row.schedule as JourneyTaskSchedule | undefined,
      times_per_day: typeof row.times_per_day === 'number' ? row.times_per_day : null,
      weekly_day: typeof row.weekly_day === 'number' ? row.weekly_day : null,
    });
    out.push({ id, title, schedule, times_per_day });
  }
  return out;
}

/** מזהה סלוט מהודעת המשתמש — "לפני בוקר", "בצהריים" וכו' */
export function inferSlotFromUserMessage(
  msg: string,
  schedule: JourneyTaskSchedule,
  timesPerDay: number
): JourneyTaskSlot {
  const m = msg.replace(/\s+/g, ' ').trim();

  if (schedule === 'per_meal') {
    if (/(?:ארוחת\s+)?בוקר|לפני\s+(?:ארוחת\s+)?בוקר|בבוקר(?!\s*מאוחר)/i.test(m)) {
      return 'meal_breakfast';
    }
    if (/(?:ארוחת\s+)?צהריים|לפני\s+(?:ארוחת\s+)?צהריים|בצהריים/i.test(m)) {
      return 'meal_lunch';
    }
    if (/(?:ארוחת\s+)?ערב|לפני\s+(?:ארוחת\s+)?ערב|בערב/i.test(m)) {
      return 'meal_dinner';
    }
    const slots = slotsForSchedule(schedule, timesPerDay);
    if (slots.includes('meal_breakfast')) return 'meal_breakfast';
    if (slots.includes('meal_lunch')) return 'meal_lunch';
    return 'meal_dinner';
  }

  if (schedule === 'multi_daily') {
    if (/בוקר|לפני\s+בוקר|בבוקר/i.test(m)) return 'morning';
    if (/צהריים|לפני\s+צהריים|בצהריים/i.test(m)) return 'noon';
    if (/ערב|לפני\s+ערב|בערב/i.test(m)) return 'evening';
    return currentSlotForSchedule(schedule, timesPerDay);
  }

  return 'full_day';
}

async function fetchTodayCompletedSlots(
  supabase: SupabaseClient,
  userId: string,
  stepId: string,
  taskId: string,
  dateKey: string
): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('journey_task_executions')
    .select('slot')
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('task_id', taskId)
    .eq('date_key', dateKey);

  const done = new Set<string>();
  if (Array.isArray(data)) {
    for (const row of data as Array<{ slot?: string }>) {
      if (typeof row.slot === 'string') done.add(row.slot);
    }
  }
  return done;
}

export async function fetchPendingAcceptedTasksForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<PendingAcceptedTask[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !Array.isArray(data)) return [];

  const todayKey = jerusalemDateKey();
  const seen = new Set<string>();
  const out: PendingAcceptedTask[] = [];

  for (const row of data) {
    const stepId = row.step_id as string | undefined;
    const js = row.journey_steps as { title?: string | null; tasks?: unknown } | null;
    if (!stepId || !js) continue;
    const tasks = parseTasksMeta(js.tasks);
    const statuses =
      row.task_statuses && typeof row.task_statuses === 'object' && !Array.isArray(row.task_statuses)
        ? (row.task_statuses as Record<string, { status?: string; execution_done?: boolean }>)
        : {};
    const stepTitle = typeof js.title === 'string' ? js.title.trim() : null;

    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const st = statuses[t.id];
      if (!st || st.status !== 'accepted') continue;

      if (t.schedule === 'one_time') {
        if (st.execution_done === true) continue;
      } else {
        const doneSlots = await fetchTodayCompletedSlots(supabase, userId, stepId, t.id, todayKey);
        const total = expectedSlotCount(t.schedule, t.times_per_day);
        if (doneSlots.size >= total) continue;
      }

      seen.add(t.id);
      out.push({
        id: t.id,
        title: t.title,
        stepId,
        stepTitle,
        schedule: t.schedule,
        times_per_day: t.times_per_day,
      });
    }
  }
  return out;
}

/**
 * תוצאת סימון משימה מהצ'אט — *מועשרת* כדי לאפשר ל-AI לתת תגובה מותאמת:
 *
 *   • daily / one_time / weekly  → `schedule` = יחיד, `totalSlotsToday = 1`,
 *                                  `slotsRemainingToday = []`.
 *     ה-AI אומר "אלוף!" וזהו.
 *
 *   • per_meal / multi_daily     → `schedule` = רב-סלוט, `totalSlotsToday >= 2`,
 *                                  `slotsRemainingToday` = הסלוטים שעוד פתוחים.
 *     ה-AI יכול לשאול "וגם בערב?" / "תותח, רק עכשיו?" — לפי הנתון.
 *
 * `slotsCompletedToday` כולל את הסלוט שזה עתה סומן. השדה `wasAlreadyDone` נכון
 * אם המשתמש סימן סלוט שכבר היה מסומן היום (idempotent, לא שגיאה).
 */
export type TaskExecutionResult =
  | {
      ok: true;
      stepId: string;
      taskId: string;
      taskTitle: string;
      slot?: JourneyTaskSlot;
      schedule: JourneyTaskSchedule;
      totalSlotsToday: number;
      slotsCompletedToday: number;
      slotsRemainingToday: JourneyTaskSlot[];
      wasAlreadyDone: boolean;
    }
  | { ok: false; error: 'no_match' | 'no_pending' | 'save_failed'; message?: string };

function messageReferencesTask(msg: string, title: string): boolean {
  if (/מים|שתייה|לשתות|כוס/i.test(title) && /מים|שתיתי|שתינו|שתית|כוס/i.test(msg)) {
    return true;
  }
  const kws = title
    .split(/[\s,·\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return kws.some((kw) => msg.includes(kw));
}

async function markRecurringSlot(
  supabase: SupabaseClient,
  userId: string,
  pick: PendingAcceptedTask,
  slot: JourneyTaskSlot,
  userMessage: string
): Promise<TaskExecutionResult> {
  const dateKey = jerusalemDateKey();
  const nowIso = new Date().toISOString();

  // האם הסלוט הזה כבר היה מסומן לפני הקריאה? — מאפשר ל-AI לדעת אם הצליח לחדש,
  // או שהמשתמש "מדווח" על משהו שכבר היה רשום (idempotent חביב).
  const slotsBeforeMark = await fetchTodayCompletedSlots(
    supabase,
    userId,
    pick.stepId,
    pick.id,
    dateKey
  );
  const wasAlreadyDone = slotsBeforeMark.has(slot);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: execErr } = await (supabase as any).from('journey_task_executions').upsert(
    {
      user_id: userId,
      step_id: pick.stepId,
      task_id: pick.id,
      date_key: dateKey,
      slot,
      completed_at: nowIso,
      source: 'chat',
      note: userMessage.slice(0, 500),
    },
    { onConflict: 'user_id,step_id,task_id,date_key,slot' }
  );

  if (execErr) {
    return { ok: false, error: 'save_failed', message: execErr.message };
  }

  /** אם כל הסלוטים של היום הושלמו — מסמן גם execution_done לתאימות */
  const doneSlots = await fetchTodayCompletedSlots(supabase, userId, pick.stepId, pick.id, dateKey);
  const total = expectedSlotCount(pick.schedule, pick.times_per_day);

  // מחשב את הסלוטים שעוד פתוחים היום — ה-AI יקבל אותם בהקשר ויוכל לשאול:
  // "תותח! גם בבוקר?" אם evening סומן ו-morning עוד פתוח.
  const allSlots = slotsForSchedule(pick.schedule, pick.times_per_day);
  const slotsRemainingToday = allSlots.filter((s) => !doneSlots.has(s));

  if (doneSlots.size >= total) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prog } = await (supabase as any)
      .from('journey_progress')
      .select('task_statuses')
      .eq('user_id', userId)
      .eq('step_id', pick.stepId)
      .maybeSingle();

    const prev =
      prog?.task_statuses && typeof prog.task_statuses === 'object' && !Array.isArray(prog.task_statuses)
        ? (prog.task_statuses as Record<string, Record<string, unknown>>)
        : {};
    const existing = prev[pick.id];
    if (existing && existing.status === 'accepted' && existing.execution_done !== true) {
      const task_statuses = {
        ...prev,
        [pick.id]: { ...existing, execution_done: true },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('journey_progress').upsert(
        {
          user_id: userId,
          step_id: pick.stepId,
          task_statuses,
          updated_at: nowIso,
        },
        { onConflict: 'user_id,step_id' }
      );
    }
  }

  return {
    ok: true,
    stepId: pick.stepId,
    taskId: pick.id,
    taskTitle: pick.title,
    slot,
    schedule: pick.schedule,
    totalSlotsToday: total,
    slotsCompletedToday: doneSlots.size,
    slotsRemainingToday,
    wasAlreadyDone,
  };
}

/**
 * מסמן ביצוע משימה שכבר accepted — one_time או recurring slot.
 */
export async function markTaskExecutionForUser(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    taskId?: string;
    userMessage: string;
    pending?: PendingAcceptedTask[];
  }
): Promise<TaskExecutionResult> {
  const pending = opts.pending ?? (await fetchPendingAcceptedTasksForUser(supabase, userId));
  if (pending.length === 0) {
    return { ok: false, error: 'no_pending' };
  }

  const msg = opts.userMessage.replace(/\s+/g, ' ').trim();

  let pick: PendingAcceptedTask | undefined;
  if (opts.taskId) {
    pick = pending.find((t) => t.id === opts.taskId);
  }
  if (!pick) {
    for (const t of pending) {
      if (messageReferencesTask(msg, t.title)) {
        pick = t;
        break;
      }
    }
  }
  const genericTaskDone =
    /(?:עשיתי|ביצעתי|סיימתי|הצלחתי|סגרתי|בוצע|כבר\s+עשיתי)(?:\s+את)?(?:\s+ה)?(?:משימה|המשימה|מה\s+שהתחייבתי|זה)|(?:שתיתי|שתינו|שתית)\s+(?:כוס(?:ות)?\s+)?מים/i.test(
      msg
    );
  if (!pick && genericTaskDone && pending.length === 1) {
    pick = pending[0];
  }

  if (!pick) {
    return { ok: false, error: 'no_match' };
  }

  if (pick.schedule !== 'one_time') {
    const slot = inferSlotFromUserMessage(msg, pick.schedule, pick.times_per_day);
    return markRecurringSlot(supabase, userId, pick, slot, msg);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prog, error: progErr } = await (supabase as any)
    .from('journey_progress')
    .select('task_statuses')
    .eq('user_id', userId)
    .eq('step_id', pick.stepId)
    .maybeSingle();

  if (progErr) {
    return { ok: false, error: 'save_failed', message: progErr.message };
  }

  const prev =
    prog?.task_statuses && typeof prog.task_statuses === 'object' && !Array.isArray(prog.task_statuses)
      ? (prog.task_statuses as Record<string, Record<string, unknown>>)
      : {};

  const existing = prev[pick.id];
  if (!existing || existing.status !== 'accepted') {
    return { ok: false, error: 'no_match' };
  }
  if (existing.execution_done === true) {
    // המשתמש דיווח שוב על משימה שכבר סגורה — לא שגיאה, חיזוק חביב.
    return {
      ok: true,
      stepId: pick.stepId,
      taskId: pick.id,
      taskTitle: pick.title,
      schedule: pick.schedule,
      totalSlotsToday: 1,
      slotsCompletedToday: 1,
      slotsRemainingToday: [],
      wasAlreadyDone: true,
    };
  }

  const nowIso = new Date().toISOString();
  const task_statuses = {
    ...prev,
    [pick.id]: {
      ...existing,
      status: 'accepted',
      decided_at: typeof existing.decided_at === 'string' ? existing.decided_at : nowIso,
      execution_done: true,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any).from('journey_progress').upsert(
    {
      user_id: userId,
      step_id: pick.stepId,
      task_statuses,
      updated_at: nowIso,
    },
    { onConflict: 'user_id,step_id' }
  );

  if (upErr) {
    return { ok: false, error: 'save_failed', message: upErr.message };
  }

  return {
    ok: true,
    stepId: pick.stepId,
    taskId: pick.id,
    taskTitle: pick.title,
    schedule: pick.schedule,
    totalSlotsToday: 1,
    slotsCompletedToday: 1,
    slotsRemainingToday: [],
    wasAlreadyDone: false,
  };
}
