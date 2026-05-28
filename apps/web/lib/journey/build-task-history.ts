/**
 * build-task-history.ts
 * ----------------------
 * בונה היסטוריית משימות מפורטת **לכל משימה שהמשתמש קיבל על עצמו**:
 *   - מתי לחץ "מקובל עליי"      (accepted_at = task_statuses[id].decided_at)
 *   - מתי בוצעה הפעם הראשונה   (first_execution_at = MIN(completed_at))
 *   - מתי בוצעה לאחרונה         (last_execution_at = MAX(completed_at))
 *   - ביצועים יומיים מלאים       (executions[] עם slot/timestamp/source/note)
 *   - ימים שהוחמצו              (missed_days — ימים פעילים מאז קבלה ללא ביצוע)
 *   - רצף הצלחות נוכחי           (current_streak / best_streak בלוח ירושלים)
 *
 * המקור היחיד לאמת:
 *   - journey_steps           ← הגדרות (title/schedule/emoji)
 *   - journey_progress        ← decision (task_statuses[id].decided_at)
 *   - journey_task_executions ← ביצועים בפועל (date_key + slot + completed_at)
 *
 * שימוש:
 *   - /progress/history        ← מסך מובייל-פרסט מפורט למשתמש
 *   - /api/v1/task-history     ← REST למובייל / סקריפטים / agents
 *   - format-user-progress-for-ai ← הזרקת timestamps לפרומפט של אלמוג
 */
import {
  isTaskActiveToday,
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
} from './task-schedule';
import { parseJourneyTasksFull } from './journey-report-parse';
import type { JourneyTask, JourneyTaskSchedule } from '../types/journey';

export type TaskHistoryRange = 'day' | 'week' | 'month' | 'year' | 'custom' | 'all';

export interface TaskHistoryRangeInput {
  /** טווח נורמטיבי. אם 'custom' — חובה from/to. */
  range?: TaskHistoryRange;
  /** YYYY-MM-DD בלוח ירושלים — תקף ל-range='custom' */
  from?: string;
  to?: string;
}

export interface TaskHistoryExecution {
  /** YYYY-MM-DD בלוח ירושלים */
  date_key: string;
  slot: string;
  /** ISO timestamp מדויק של הסימון */
  completed_at: string;
  source: 'manual' | 'chat' | 'reminder';
  note?: string | null;
}

export interface TaskHistoryDay {
  /** YYYY-MM-DD בלוח ירושלים */
  date_key: string;
  /** האם המשימה הייתה פעילה ביום הזה (לפי schedule + accepted_at) */
  was_due: boolean;
  /** מספר הסלוטים שצפויים ביום הזה */
  expected_slots: number;
  /** מספר הסלוטים שבוצעו בפועל ביום הזה */
  done_slots: number;
  /** סלוטים שבוצעו (לתצוגה: meal_lunch, morning, full_day וכו') */
  slots: string[];
  /** סטטוס היום: done = כל מה שצריך / partial = חלק / missed = פעיל אך 0 / off = לא פעיל ביום הזה */
  status: 'done' | 'partial' | 'missed' | 'off' | 'before_accept';
  /** הביצועים המדויקים של היום הזה (ISO timestamps + slot) — רלוונטי לתצוגת טיימליין */
  executions: TaskHistoryExecution[];
}

export interface TaskHistoryEntry {
  task_id: string;
  task_title: string;
  task_emoji: string;
  task_description: string | null;
  /** ייצוג מילולי של schedule (e.g., 'יומי', '3 פעמים ביום', 'אחרי כל ארוחה') */
  schedule_label: string;
  schedule: JourneyTaskSchedule;
  step_id: string;
  step_number: number;
  step_title: string;

  /** מתי המשתמש לחץ "מקובל עליי" — ISO timestamp (UTC) */
  accepted_at: string | null;
  /** ISO של הביצוע הראשון אי-פעם של המשימה (לאו דווקא בטווח) */
  first_execution_at: string | null;
  /** ISO של הביצוע האחרון אי-פעם של המשימה (לאו דווקא בטווח) */
  last_execution_at: string | null;

  /** סך כל הביצועים בטווח שנבחר */
  total_executions_in_range: number;
  /** ימים פעילים בטווח (לפחות סלוט אחד הושלם) */
  active_days_in_range: number;
  /** ימים שהיו פעילים (was_due) בטווח */
  due_days_in_range: number;
  /** ימים שהוחמצו (was_due && status===missed) בטווח */
  missed_days_in_range: number;
  /** רצף ימים רצוף נוכחי (כולל היום אם הושלם, נספר רק ימי due_days) */
  current_streak: number;
  /** השיא של רצף ימים בכל ההיסטוריה */
  best_streak: number;
  /** אחוז הצלחה בטווח (active_days / due_days) */
  success_rate_pct: number;
  /** משימה חד-פעמית שסומנה "בוצע" במסך דיווח (execution_done ב-task_statuses) */
  execution_done: boolean;

  /**
   * שורה לכל יום בטווח — מהחדש לישן.
   * כולל "off" / "before_accept" כדי שה-UI יוכל להבחין בין "פספוס" ל"לא רלוונטי".
   */
  days: TaskHistoryDay[];
}

export interface TaskHistoryRangeMeta {
  range: TaskHistoryRange;
  from: string;
  to: string;
  /** מספר ימי טווח (כולל קצוות) */
  days_in_range: number;
  /** שם תצוגה לתקופה (e.g., "30 הימים האחרונים", "השבוע", "השנה") */
  label: string;
}

export interface TaskHistoryReport {
  meta: TaskHistoryRangeMeta;
  /** סך הכל משימות שהמשתמש קיבל אי פעם — גם מחוץ לטווח */
  total_accepted_lifetime: number;
  /** ביצועים בטווח */
  total_executions_in_range: number;
  /** ימים פעילים בטווח */
  active_days_in_range: number;
  /** ממוצע הצלחה בטווח (אחוז) */
  overall_success_rate_pct: number;
  /** רשימת המשימות שהמשתמש קיבל — מסודרות לפי החדש ביותר (accepted_at desc) */
  tasks: TaskHistoryEntry[];
  /** סטיב'ים שלא קיבל אבל יש להם מידע (rejected) — אופציונלי לתצוגה */
  rejected_tasks: Array<{
    task_id: string;
    task_title: string;
    step_id: string;
    step_number: number;
    step_title: string;
    rejected_at: string | null;
  }>;
}

interface TaskStatusEntry {
  status?: string;
  decided_at?: string | null;
  reason?: string | null;
  execution_done?: boolean;
}

interface ProgressRow {
  step_id: string;
  task_statuses?: Record<string, TaskStatusEntry> | null;
}

interface ExecutionRow {
  step_id: string;
  task_id: string;
  date_key: string;
  slot: string;
  completed_at: string;
  source?: string | null;
  note?: string | null;
}

interface StepRow {
  id: string;
  title: string;
  step_number: number;
  is_published: boolean;
  tasks: unknown;
}

/* ============================================================
 *  Date helpers
 * ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, deltaDays: number): Date {
  return new Date(date.getTime() + deltaDays * DAY_MS);
}

/** ממיר YYYY-MM-DD ל-Date בחצות UTC (לטובת חישובי הפרשי ימים) */
function dateKeyToUtcMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDaysInclusive(from: string, to: string): number {
  const a = dateKeyToUtcMidnight(from);
  const b = dateKeyToUtcMidnight(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
}

/** מייצר רשימת date_keys מהחדש לישן בין from..to (כלולים), בלוח ירושלים. */
function listDateKeysDescending(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = dateKeyToUtcMidnight(to);
  const limit = dateKeyToUtcMidnight(from);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(limit.getTime())) return out;
  while (cursor.getTime() >= limit.getTime()) {
    out.push(jerusalemDateKey(cursor));
    cursor = addDays(cursor, -1);
  }
  return out;
}

export function resolveTaskHistoryRange(
  input: TaskHistoryRangeInput | undefined,
  now: Date = new Date()
): TaskHistoryRangeMeta {
  const todayKey = jerusalemDateKey(now);
  const range: TaskHistoryRange = input?.range ?? 'month';

  if (range === 'custom') {
    const from = (input?.from ?? '').trim();
    const to = (input?.to ?? '').trim() || todayKey;
    const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : todayKey;
    const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : todayKey;
    const [start, end] = safeFrom <= safeTo ? [safeFrom, safeTo] : [safeTo, safeFrom];
    const days = diffDaysInclusive(start, end);
    return {
      range: 'custom',
      from: start,
      to: end,
      days_in_range: days,
      label: `מותאם · ${start} → ${end}`,
    };
  }

  if (range === 'all') {
    /** "מההתחלה" — נתעד את כל מה שיש. נגדיר from = תאריך עתיק; ה-DB יחתוך לפי מה שיש. */
    return {
      range: 'all',
      from: '2024-01-01',
      to: todayKey,
      days_in_range: diffDaysInclusive('2024-01-01', todayKey),
      label: 'מההתחלה',
    };
  }

  let days = 30;
  let label = '30 הימים האחרונים';
  if (range === 'day') {
    days = 1;
    label = 'היום';
  } else if (range === 'week') {
    days = 7;
    label = 'השבוע האחרון';
  } else if (range === 'month') {
    days = 30;
    label = '30 הימים האחרונים';
  } else if (range === 'year') {
    days = 365;
    label = 'השנה האחרונה';
  }
  const from = jerusalemDateKey(addDays(now, -(days - 1)));
  return { range, from, to: todayKey, days_in_range: days, label };
}

/* ============================================================
 *  Schedule label
 * ============================================================ */

function buildScheduleLabel(task: JourneyTask): string {
  const { schedule, times_per_day, weekly_day, meal_timing, meal_target } = resolveTaskSchedule(task);
  const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  switch (schedule) {
    case 'one_time':
      return 'חד-פעמי';
    case 'daily':
      return 'פעם ביום';
    case 'multi_daily':
      return `${times_per_day} פעמים ביום`;
    case 'weekly':
      return `שבועי · יום ${WEEKDAY[weekly_day] ?? '?'}`;
    case 'per_meal': {
      const prefix = meal_timing === 'after' ? 'אחרי' : 'לפני';
      if (meal_target === 'all') return `${prefix} כל הארוחות`;
      if (times_per_day >= 3) return `${prefix} כל ארוחה`;
      return `${prefix} ${times_per_day} ארוחות`;
    }
  }
}

/* ============================================================
 *  Streak computation
 * ============================================================ */

function computeStreaks(
  daysAsc: TaskHistoryDay[],
  todayKey: string
): { current: number; best: number } {
  /**
   * רצף = ימים פעילים רצופים (was_due && done/partial).
   * "off" / "before_accept" מנוטרלים — לא שוברים אך גם לא נספרים.
   */
  let best = 0;
  let running = 0;
  let currentEndingToday = 0;
  let runningEndsAtToday = false;

  for (const day of daysAsc) {
    if (day.status === 'off' || day.status === 'before_accept') continue;
    if (day.status === 'done' || day.status === 'partial') {
      running += 1;
      if (running > best) best = running;
      if (day.date_key === todayKey) {
        currentEndingToday = running;
        runningEndsAtToday = true;
      } else if (runningEndsAtToday) {
        runningEndsAtToday = false;
      }
    } else {
      running = 0;
      runningEndsAtToday = false;
    }
  }

  /** "הרצף הנוכחי" – אם היום פעיל ויש רצף שמסתיים היום, זה הרצף.
   *  אחרת – האחרון שלא הסתיים בכישלון אקטיבי קרוב. נשמור רק אם זה רץ עד היום. */
  return { current: currentEndingToday, best };
}

/* ============================================================
 *  Main builder
 * ============================================================ */

/**
 * בונה דו"ח היסטוריית משימות מפורט עבור משתמש בודד.
 *
 * - `supabase` יכול להיות client רגיל (RLS) או admin (Ops/AI).
 * - השאילתה ל-executions תמיד מסוננת לפי user_id (RLS תופסת ממילא).
 *
 * חישוב "missed days" נעשה לאחר השליפה לפי resolveTaskSchedule + accepted_at —
 * כך שאנחנו יכולים להציג גם ימים בעבר שהמשתמש לא ביצע, גם אם אין שורות executions.
 */
export async function buildTaskHistoryReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  rangeInput?: TaskHistoryRangeInput,
  now: Date = new Date()
): Promise<TaskHistoryReport> {
  const meta = resolveTaskHistoryRange(rangeInput, now);
  const todayKey = jerusalemDateKey(now);
  /** רוחב טווח לסקירת רצף — מספיק 90 יום להצגת best_streak גם אם הטווח קצר */
  const streakWindowKey = jerusalemDateKey(addDays(now, -89));

  const [{ data: rawSteps }, { data: rawProgress }, { data: rawExecutions }] =
    await Promise.all([
      supabase
        .from('journey_steps')
        .select('id, title, step_number, is_published, tasks')
        .order('step_number', { ascending: true }),
      supabase
        .from('journey_progress')
        .select('step_id, task_statuses')
        .eq('user_id', userId),
      supabase
        .from('journey_task_executions')
        .select('step_id, task_id, date_key, slot, completed_at, source, note')
        .eq('user_id', userId)
        .order('completed_at', { ascending: true })
        .limit(5000),
    ]);

  const steps: StepRow[] = (rawSteps ?? []) as StepRow[];
  const progRows: ProgressRow[] = (rawProgress ?? []) as ProgressRow[];
  const allExecutions: ExecutionRow[] = (rawExecutions ?? []) as ExecutionRow[];

  /** index: stepId → progress row */
  const progByStep = new Map<string, ProgressRow>();
  for (const p of progRows) progByStep.set(p.step_id, p);

  /** index: taskId → executions ascending by completed_at (כל ההיסטוריה) */
  const execByTask = new Map<string, ExecutionRow[]>();
  for (const e of allExecutions) {
    const arr = execByTask.get(e.task_id) ?? [];
    arr.push(e);
    execByTask.set(e.task_id, arr);
  }

  const tasks: TaskHistoryEntry[] = [];
  const rejected: TaskHistoryReport['rejected_tasks'] = [];
  let totalExecutionsInRange = 0;
  let totalActiveDaysInRange = 0;
  let totalDueDaysInRange = 0;

  for (const step of steps) {
    const stepProg = progByStep.get(step.id);
    const ts = (stepProg?.task_statuses ?? {}) as Record<string, TaskStatusEntry>;
    const taskDefs = parseJourneyTasksFull(step.tasks);

    for (const task of taskDefs) {
      const decision = ts[task.id];
      if (!decision || (decision.status !== 'accepted' && decision.status !== 'rejected'))
        continue;

      if (decision.status === 'rejected') {
        rejected.push({
          task_id: task.id,
          task_title: task.title,
          step_id: step.id,
          step_number: step.step_number,
          step_title: step.title,
          rejected_at: decision.decided_at ?? null,
        });
        continue;
      }

      const accepted_at = decision.decided_at ?? null;
      const execution_done = decision.execution_done === true;
      const acceptedDateKey = accepted_at
        ? jerusalemDateKey(new Date(accepted_at))
        : null;

      const allExec = execByTask.get(task.id) ?? [];
      /** ה-list ממוין עולה. הראשון = first; האחרון = last. */
      const first_execution_at = allExec[0]?.completed_at ?? null;
      const last_execution_at = allExec[allExec.length - 1]?.completed_at ?? null;

      /** בנייה של מפת date_key → slots עם ביצועים מלאים */
      const dayMap = new Map<string, TaskHistoryExecution[]>();
      for (const e of allExec) {
        const arr = dayMap.get(e.date_key) ?? [];
        arr.push({
          date_key: e.date_key,
          slot: e.slot,
          completed_at: e.completed_at,
          source: ((): TaskHistoryExecution['source'] => {
            if (e.source === 'chat' || e.source === 'reminder') return e.source;
            return 'manual';
          })(),
          note: e.note ?? null,
        });
        dayMap.set(e.date_key, arr);
      }

      const { schedule, times_per_day } = resolveTaskSchedule(task);
      const expectedSlotsPerDay = slotsForSchedule(schedule, times_per_day).length;

      /** טווח ימים לסקירת UI (descending) */
      const rangeKeysDesc = listDateKeysDescending(meta.from, meta.to);
      /** טווח רחב יותר לחישוב streak (90 ימים) */
      const streakKeysDesc = listDateKeysDescending(streakWindowKey, todayKey);

      const buildDay = (dateKey: string): TaskHistoryDay => {
        const execs = dayMap.get(dateKey) ?? [];
        const dueToday = isTaskDueOnDate(task, dateKey, acceptedDateKey);
        const beforeAccept = acceptedDateKey ? dateKey < acceptedDateKey : false;
        let status: TaskHistoryDay['status'];
        if (beforeAccept) status = 'before_accept';
        else if (!dueToday) status = execs.length > 0 ? 'done' : 'off';
        else if (execs.length === 0) status = 'missed';
        else if (execs.length >= expectedSlotsPerDay) status = 'done';
        else status = 'partial';
        return {
          date_key: dateKey,
          was_due: dueToday,
          expected_slots: dueToday ? expectedSlotsPerDay : 0,
          done_slots: execs.length,
          slots: execs.map((x) => x.slot),
          status,
          executions: execs.sort((a, b) => a.completed_at.localeCompare(b.completed_at)),
        };
      };

      let days = rangeKeysDesc.map(buildDay);

      /** משימה חד-פעמית שסומנה בוצעה בדיווח — מוסיפים יום סינתטי אם אין execution ב-DB */
      if (schedule === 'one_time' && execution_done && allExec.length === 0 && acceptedDateKey) {
        const syntheticKey = acceptedDateKey;
        if (meta.from <= syntheticKey && syntheticKey <= meta.to) {
          days = days.map((d) =>
            d.date_key === syntheticKey
              ? {
                  ...d,
                  status: 'done' as const,
                  was_due: true,
                  expected_slots: 1,
                  done_slots: 1,
                  slots: ['full_day'],
                  executions: accepted_at
                    ? [
                        {
                          date_key: syntheticKey,
                          slot: 'full_day',
                          completed_at: accepted_at,
                          source: 'manual' as const,
                          note: 'דיווח חד-פעמי',
                        },
                      ]
                    : [],
                }
              : d
          );
        }
      }

      /** סטטיסטיקה לטווח */
      let total_executions_in_range = 0;
      let active_days_in_range = 0;
      let due_days_in_range = 0;
      let missed_days_in_range = 0;
      for (const d of days) {
        total_executions_in_range += d.done_slots;
        if (d.status === 'done' || d.status === 'partial') active_days_in_range++;
        if (d.was_due && d.status !== 'before_accept') due_days_in_range++;
        if (d.status === 'missed') missed_days_in_range++;
      }

      /** רצף — נחשב על חלון 90 יום בסדר עולה */
      const streakDaysAsc = streakKeysDesc.map(buildDay).reverse();
      const { current, best } = computeStreaks(streakDaysAsc, todayKey);

      const success_rate_pct =
        due_days_in_range > 0
          ? Math.round((active_days_in_range / due_days_in_range) * 100)
          : active_days_in_range > 0
            ? 100
            : 0;

      const entry: TaskHistoryEntry = {
        task_id: task.id,
        task_title: task.title,
        task_emoji: task.emoji || '✅',
        task_description: task.description,
        schedule_label: buildScheduleLabel(task),
        schedule,
        step_id: step.id,
        step_number: step.step_number,
        step_title: step.title,
        accepted_at,
        first_execution_at,
        last_execution_at,
        total_executions_in_range,
        active_days_in_range,
        due_days_in_range,
        missed_days_in_range,
        current_streak: current,
        best_streak: best,
        success_rate_pct,
        execution_done,
        days,
      };

      tasks.push(entry);
      totalExecutionsInRange += total_executions_in_range;
      totalActiveDaysInRange += active_days_in_range;
      totalDueDaysInRange += due_days_in_range;
    }
  }

  /** סדר: לפי accepted_at desc → השפעה: המשימות החדשות ביותר למעלה */
  tasks.sort((a, b) => {
    const A = a.accepted_at ?? '';
    const B = b.accepted_at ?? '';
    return B.localeCompare(A);
  });

  rejected.sort((a, b) => (b.rejected_at ?? '').localeCompare(a.rejected_at ?? ''));

  const overall_success_rate_pct =
    totalDueDaysInRange > 0
      ? Math.round((totalActiveDaysInRange / totalDueDaysInRange) * 100)
      : totalActiveDaysInRange > 0
        ? 100
        : 0;

  return {
    meta,
    total_accepted_lifetime: tasks.length,
    total_executions_in_range: totalExecutionsInRange,
    active_days_in_range: totalActiveDaysInRange,
    overall_success_rate_pct,
    tasks,
    rejected_tasks: rejected,
  };
}

/* ============================================================
 *  Helpers — task due on specific date (vs current "today")
 * ============================================================ */

/**
 * האם המשימה הייתה אמורה להתבצע ביום `dateKey` הספציפי?
 *  - one_time:  לא נחשב "due" יומי. (זה משימה חד-פעמית — ייסופר בנפרד אם execution_done)
 *  - daily / multi_daily / per_meal: כל יום אחרי accepted.
 *  - weekly: רק ביום השבוע הנכון.
 *
 * dateKey צריך להיות **אחרי** accepted_date_key. אם לפני, ה-status יהיה 'before_accept'
 * וזה מטופל מחוץ לפונקציה הזו.
 */
function isTaskDueOnDate(
  task: JourneyTask,
  dateKey: string,
  acceptedDateKey: string | null
): boolean {
  if (acceptedDateKey && dateKey < acceptedDateKey) return false;
  const { schedule } = resolveTaskSchedule(task);
  if (schedule === 'one_time') return false;
  if (schedule === 'weekly') {
    /** isTaskActiveToday עובד עם Date — נמיר */
    const date = dateKeyToUtcMidnight(dateKey);
    if (Number.isNaN(date.getTime())) return false;
    return isTaskActiveToday(task, date);
  }
  return true;
}
