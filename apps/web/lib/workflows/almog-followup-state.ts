import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { normalizeTaskSchedule } from '../journey/task-schedule';
import type { JourneyTaskSchedule } from '../types/journey';

export type AlmogFollowupUserState = {
  taskFollowupRowFound: boolean;
  taskAccepted: boolean;
  /** true = המשתמש סימן בפועל שביצע (או שדה חסר ואז נחשב שלא בוצע) */
  taskExecutionReported: boolean;
  /** תזמון המשימה — קובע איך מתייחסים ל"דווח על ביצוע" */
  taskSchedule: JourneyTaskSchedule;
  taskStepTitle: string | null;
  taskStationTitle: string | null;
  currentStationTitle: string | null;
  currentStepTitle: string | null;
  currentStepNumber: number | null;
  activeHabits: { id: string; title: string }[];
  ingrainedHabits: { id: string; title: string; fromStepTitle: string }[];
};

type TaskStatusRow = {
  status?: string;
  /** נשמר ב-JSON של task_statuses */
  execution_done?: boolean;
};

type ParsedTaskMeta = {
  id: string;
  title: string;
  schedule: JourneyTaskSchedule;
};

function parseTasks(raw: unknown): ParsedTaskMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!id || !title) return null;
      const schedule = normalizeTaskSchedule(row.schedule);
      return { id, title, schedule };
    })
    .filter((x): x is ParsedTaskMeta => Boolean(x));
}

function parseHabits(raw: unknown): { id: string; title: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((x): x is { id: string; title: string } => Boolean(x));
}

function stationTitleFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const t = raw[0] && typeof raw[0] === 'object' ? (raw[0] as { title?: string }).title : undefined;
    return typeof t === 'string' ? t : null;
  }
  if (typeof raw === 'object' && 'title' in raw) {
    const t = (raw as { title?: unknown }).title;
    return typeof t === 'string' ? t : null;
  }
  return null;
}

/**
 * שליפת מצב משתמש ל-workflow Almog (רק מתוך context.run עם service role).
 */
export async function fetchAlmogFollowupUserState(
  admin: SupabaseClient<Database>,
  userId: string,
  taskId: string
): Promise<AlmogFollowupUserState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows, error: progErr } = await (admin as any)
    .from('journey_progress')
    .select(
      `
      step_id,
      tasks_completed,
      task_statuses,
      is_completed,
      updated_at,
      journey_steps (
        id,
        title,
        step_number,
        tasks,
        habits,
        journey_stations ( title )
      )
    `
    )
    .eq('user_id', userId);

  if (progErr) {
    throw new Error(progErr.message);
  }

  const rows = (progressRows ?? []) as {
    step_id: string;
    tasks_completed: Record<string, boolean> | null;
    task_statuses: Record<string, TaskStatusRow> | null;
    is_completed: boolean | null;
    updated_at: string;
    journey_steps: {
      id: string;
      title: string | null;
      step_number: number | null;
      tasks: unknown;
      habits: unknown;
      journey_stations: unknown;
    } | null;
  }[];

  let taskRow = rows.find((r) => parseTasks(r.journey_steps?.tasks).some((t) => t.id === taskId));

  const latest = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];

  const latestStep = latest?.journey_steps;
  const currentStationTitle = stationTitleFromJoin(latestStep?.journey_stations);
  const currentStepTitle = latestStep?.title?.trim() ?? null;
  const currentStepNumber = typeof latestStep?.step_number === 'number' ? latestStep.step_number : null;

  const activeHabits = parseHabits(latestStep?.habits);

  const ingrained: { id: string; title: string; fromStepTitle: string }[] = [];
  for (const r of rows) {
    if (!r.is_completed || !r.journey_steps) continue;
    const stepTitle = r.journey_steps.title?.trim() || 'צעד';
    for (const h of parseHabits(r.journey_steps.habits)) {
      ingrained.push({ ...h, fromStepTitle: stepTitle });
    }
  }

  if (!taskRow) {
    return {
      taskFollowupRowFound: false,
      taskAccepted: false,
      taskExecutionReported: false,
      taskSchedule: 'one_time',
      taskStepTitle: null,
      taskStationTitle: null,
      currentStationTitle,
      currentStepTitle,
      currentStepNumber,
      activeHabits,
      ingrainedHabits: ingrained,
    };
  }

  const rawTs = taskRow.task_statuses?.[taskId] as TaskStatusRow | undefined;
  const taskAccepted = rawTs?.status === 'accepted';

  const taskStep = taskRow.journey_steps;
  const taskTitles = parseTasks(taskStep?.tasks);
  const taskMeta = taskTitles.find((t) => t.id === taskId) ?? null;
  const taskSchedule: JourneyTaskSchedule = taskMeta?.schedule ?? 'one_time';
  const taskStepTitle = taskMeta?.title ?? taskStep?.title ?? null;

  /**
   * עבור משימה חוזרת — `execution_done` בא רק אחרי שכל הסלוטים של היום הושלמו.
   * לכן נשתמש בטבלת ה-executions כדי לראות אם המשתמש "נגע" במשימה בכלל —
   * אם כן, אין טעם בתזכורת follow-up; cron יומי הוא הזרימה הנכונה.
   */
  let taskExecutionReported = rawTs?.execution_done === true;
  if (!taskExecutionReported && taskSchedule !== 'one_time') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: anyExec } = await (admin as any)
      .from('journey_task_executions')
      .select('id')
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .limit(1);
    if (Array.isArray(anyExec) && anyExec.length > 0) {
      taskExecutionReported = true;
    }
  }

  return {
    taskFollowupRowFound: true,
    taskAccepted,
    taskExecutionReported,
    taskSchedule,
    taskStepTitle,
    taskStationTitle: stationTitleFromJoin(taskStep?.journey_stations),
    currentStationTitle,
    currentStepTitle,
    currentStepNumber,
    activeHabits,
    ingrainedHabits: ingrained,
  };
}
