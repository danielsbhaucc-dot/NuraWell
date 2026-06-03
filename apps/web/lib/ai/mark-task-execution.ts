/**
 * סימון תוצאה של משימה מהצ'אט — תומך עכשיו ב-4 סוגי outcome:
 *  - completed       (default) → ביצוע מלא
 *  - partial                   → ביצוע חלקי (חדש, מיגרציה 000031)
 *  - attempt_failed            → ניסה ולא הצליח (מיגרציה 000030)
 *  - skipped                   → דילוג מודע ליום (חדש, מיגרציה 000031)
 *
 * עבור one_time:
 *  - completed/partial → מסומן ב-task_statuses.execution_done
 *  - attempt_failed/skipped → נשמר ב-task_statuses אבל לא מסמן את ה-task כהשלם
 *
 * עבור recurring (daily / multi_daily / weekly / per_meal):
 *  - השורה נכתבת תמיד ל-journey_task_executions עם ה-outcome המתאים.
 *  - רק `outcome='completed'` נחשב להשלמת סלוט לצורך execution_done הכולל.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import {
  currentSlotForSchedule,
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
} from '../journey/task-schedule';
import type { TaskExecutionOutcomeFromCategory } from './response-classifier';

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

/**
 * מחזיר רק סלוטים שסומנו כהשלמה מלאה (`outcome='completed'`).
 * partial / attempt_failed / skipped *לא* נחשבים להשלמה לצורך
 * סגירת הסלוט — אם המשתמש דיווח "שתיתי קצת" הוא עדיין יכול לחזור מאוחר
 * יותר ולומר "אוקיי שתיתי עכשיו עוד שתיים" ולסגור את הסלוט.
 */
async function fetchTodayCompletedSlots(
  supabase: SupabaseClient,
  userId: string,
  stepId: string,
  taskId: string,
  dateKey: string
): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_task_executions')
    .select('slot, outcome')
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('task_id', taskId)
    .eq('date_key', dateKey);

  const done = new Set<string>();
  // fallback אם העמודה outcome עדיין לא קיימת ב-DB
  if (error && (error.code === '42703' || /outcome/i.test(error.message ?? ''))) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: legacy } = await (supabase as any)
      .from('journey_task_executions')
      .select('slot')
      .eq('user_id', userId)
      .eq('step_id', stepId)
      .eq('task_id', taskId)
      .eq('date_key', dateKey);
    if (Array.isArray(legacy)) {
      for (const row of legacy as Array<{ slot?: string }>) {
        if (typeof row.slot === 'string') done.add(row.slot);
      }
    }
    return done;
  }
  if (Array.isArray(data)) {
    for (const row of data as Array<{ slot?: string; outcome?: string }>) {
      if (typeof row.slot !== 'string') continue;
      // רק 'completed' נחשב — אם השדה חסר (DB ישן), נחשיב כ-completed לתאימות.
      if (!row.outcome || row.outcome === 'completed') {
        done.add(row.slot);
      }
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
  userMessage: string,
  outcome: TaskExecutionOutcomeFromCategory
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
  const wasAlreadyDone = slotsBeforeMark.has(slot) && outcome === 'completed';

  /**
   * תרגום outcome קלסיפיקטור → ערך DB. שדה ה-outcome ב-DB תומך עכשיו ב-4
   * ערכים (000030 + 000031). הקלסיפיקטור כבר מחזיר ערכים תואמים — אבל
   * שומרים על העברה מפורשת כדי שאם בעתיד הקלסיפיקטור יוסיף ערכים, נדע פה.
   */
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
      outcome,
      note: userMessage.slice(0, 500),
    },
    { onConflict: 'user_id,step_id,task_id,date_key,slot' }
  );

  if (execErr) {
    /**
     * fallback אם ה-DB עדיין על מיגרציה ישנה (ללא 000031 או 000030).
     * אם השדה outcome לא קיים בכלל — ננסה בלי אותו שדה (כך שלפחות completed
     * עדיין נכתב). אם outcome קיים אבל הערך לא חוקי (לפני 000031), נכתוב
     * כ-attempt_failed (התואם הקרוב ביותר ל-partial/skipped עד שהמיגרציה תרוץ).
     */
    const msg = execErr.message ?? '';
    if (execErr.code === '42703' || /outcome/i.test(msg)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: legacyErr } = await (supabase as any).from('journey_task_executions').upsert(
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
      if (legacyErr) {
        return { ok: false, error: 'save_failed', message: legacyErr.message };
      }
    } else if (/check.*outcome/i.test(msg) && (outcome === 'partial' || outcome === 'skipped')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: legacyErr } = await (supabase as any).from('journey_task_executions').upsert(
        {
          user_id: userId,
          step_id: pick.stepId,
          task_id: pick.id,
          date_key: dateKey,
          slot,
          completed_at: nowIso,
          source: 'chat',
          outcome: 'attempt_failed',
          note: userMessage.slice(0, 500),
        },
        { onConflict: 'user_id,step_id,task_id,date_key,slot' }
      );
      if (legacyErr) {
        return { ok: false, error: 'save_failed', message: legacyErr.message };
      }
    } else {
      return { ok: false, error: 'save_failed', message: msg };
    }
  }

  /** אם כל הסלוטים של היום הושלמו — מסמן גם execution_done לתאימות */
  const doneSlots = await fetchTodayCompletedSlots(supabase, userId, pick.stepId, pick.id, dateKey);
  const total = expectedSlotCount(pick.schedule, pick.times_per_day);

  // מחשב את הסלוטים שעוד פתוחים היום — ה-AI יקבל אותם בהקשר ויוכל לשאול:
  // "תותח! גם בבוקר?" אם evening סומן ו-morning עוד פתוח.
  const allSlots = slotsForSchedule(pick.schedule, pick.times_per_day);
  const slotsRemainingToday = allSlots.filter((s) => !doneSlots.has(s));

  // רק `outcome='completed'` סוגר את ה-task. partial/failed/skipped משאירים פתוח.
  if (doneSlots.size >= total && outcome === 'completed') {
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
 * מסמן ביצוע (או partial / failed / skipped) של משימה שכבר accepted —
 * one_time או recurring slot.
 *
 * `outcome` (ברירת מחדל 'completed') קובע איזה ערך נכתב ל-DB ואיך
 * שמירת ה-execution_done מתבצעת. רק `completed` סוגר את ה-task כליל.
 */
export async function markTaskExecutionForUser(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    taskId?: string;
    userMessage: string;
    pending?: PendingAcceptedTask[];
    outcome?: TaskExecutionOutcomeFromCategory;
  }
): Promise<TaskExecutionResult> {
  const pending = opts.pending ?? (await fetchPendingAcceptedTasksForUser(supabase, userId));
  if (pending.length === 0) {
    return { ok: false, error: 'no_pending' };
  }
  const outcome: TaskExecutionOutcomeFromCategory = opts.outcome ?? 'completed';

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
    return markRecurringSlot(supabase, userId, pick, slot, msg, outcome);
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

  /**
   * עבור one_time:
   *  - completed              → execution_done=true (סוגר את המשימה כליל).
   *  - partial                → execution_done לא נכתב; שומר last_outcome כדי
   *                              שהאדמין/AI יראו "התחיל אבל לא סיים".
   *  - attempt_failed / skipped → רק last_outcome נשמר; המשימה נשארת פתוחה.
   *
   * השדה `last_outcome` הוא JSON-only (לא DB DDL) — `task_statuses` כבר
   * JSONB גמיש ב-`journey_progress`. אנחנו לא משבשים את המבנה — `status`
   * נשאר 'accepted', רק `execution_done` ו-`last_outcome` משתנים.
   */
  const isFullyDone = outcome === 'completed';
  const task_statuses = {
    ...prev,
    [pick.id]: {
      ...existing,
      status: 'accepted',
      decided_at: typeof existing.decided_at === 'string' ? existing.decided_at : nowIso,
      ...(isFullyDone ? { execution_done: true } : {}),
      last_outcome: outcome,
      last_outcome_at: nowIso,
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
    slotsCompletedToday: isFullyDone ? 1 : 0,
    slotsRemainingToday: isFullyDone ? [] : ['full_day'],
    wasAlreadyDone: false,
  };
}
