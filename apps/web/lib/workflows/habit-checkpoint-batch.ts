import type {
  AlmogHabitCheckpointPayload,
  HabitCheckpointCompletionStatus,
  HabitCheckpointNudgeLevel,
  HabitCheckpointSlot,
} from './almog-habit-checkpoint-payload';
import {
  fetchUserIdsWithChatToday,
  mergeHabitsDoneTodayFromRows,
} from '../ai/almog-daily-context';
import { isHabitDoneTodayFromTasks } from '../journey/habit-progress';
import { parseJourneyTasksFull } from '../journey/journey-report-parse';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
  parseJourneyHabitsJson,
  type ParsedJourneyHabit,
} from './habit-checkpoint-eligibility';
import {
  normalizeTaskSchedule,
  resolveTaskSchedule,
  scheduleLabel as scheduleLabelHe,
  slotLabel as slotLabelHe,
  slotsForSchedule,
} from '../journey/task-schedule';
import type {
  JourneyTaskSchedule,
  JourneyTaskSlot,
} from '../types/journey';

/**
 * שדות לקריאה מ-journey_progress + מ-journey_steps לחישוב התראות.
 * הוסיפו `tasks` ו-`task_statuses` כדי לזהות משימות שהמשתמש קיבל אבל לא ביצע.
 */
export type ProgressRow = {
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

/**
 * ביצועי-סלוטים של היום פר משימה למשתמש.
 *  key = task_id → Set<slot שבוצע היום בלוח ירושלים>.
 */
export type TodayExecutionsByUser = Map<string, Map<string, Set<string>>>;

type ParsedTask = {
  id: string;
  title: string;
  schedule: JourneyTaskSchedule;
  times_per_day: number;
  weekly_day: number;
  meal_timing: 'before' | 'after';
  meal_target: 'fixed' | 'all';
};

type TaskStatusEntry = {
  status?: unknown;
  execution_done?: unknown;
};

function parseJourneyTasksJson(raw: unknown): ParsedTask[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    const tpdRaw = row.times_per_day;
    const wdRaw = row.weekly_day;
    const resolved = resolveTaskSchedule({
      schedule: normalizeTaskSchedule(row.schedule),
      times_per_day:
        typeof tpdRaw === 'number' && tpdRaw >= 1 && tpdRaw <= 6 ? tpdRaw : null,
      weekly_day:
        typeof wdRaw === 'number' && wdRaw >= 0 && wdRaw <= 6 ? wdRaw : null,
      meal_timing: row.meal_timing === 'after' ? 'after' : 'before',
      meal_target: row.meal_target === 'all' ? 'all' : 'fixed',
    });
    out.push({
      id,
      title,
      schedule: resolved.schedule,
      times_per_day: resolved.times_per_day,
      weekly_day: resolved.weekly_day,
      meal_timing: resolved.meal_timing,
      meal_target: resolved.meal_target,
    });
  }
  return out;
}

/**
 * Mapping מ-cron slot ל-slot ספציפי במשימת `per_meal`.
 * משתמש בעיקר כדי לקבוע "האם המשתמש כבר ביצע את הסלוט הרלוונטי לחלון הזה".
 */
function perMealSlotForCronSlot(slot: HabitCheckpointSlot): JourneyTaskSlot {
  if (slot === 'morning') return 'meal_breakfast';
  if (slot === 'midday') return 'meal_lunch';
  return 'meal_dinner';
}

/**
 * האם משימה חוזרת "סגורה" לחלון הזמן הנוכחי?
 *  - per_meal: הסלוט המתאים לחלון בוצע היום.
 *  - daily/weekly: הסלוט היחיד full_day בוצע היום.
 *  - multi_daily: כל הסלוטים של היום בוצעו.
 */
function isRecurringTaskClosedForSlot(
  task: ParsedTask,
  doneSlots: Set<string>,
  cronSlot: HabitCheckpointSlot,
  jerusalemWeekday: number
): boolean {
  if (task.schedule === 'one_time') return false;
  if (task.schedule === 'weekly') {
    if (jerusalemWeekday !== task.weekly_day) return true; /** לא רלוונטי היום בכלל */
    return doneSlots.has('full_day');
  }
  if (task.schedule === 'daily') {
    return doneSlots.has('full_day');
  }
  if (task.schedule === 'per_meal') {
    const target = perMealSlotForCronSlot(cronSlot);
    return doneSlots.has(target);
  }
  /** multi_daily */
  const expected = slotsForSchedule(task.schedule, task.times_per_day);
  return expected.every((s) => doneSlots.has(s));
}

/** אם משימה חוזרת — מחזיר אילו סלוטים עוד פתוחים היום (לרמז ב-pendingTasks). */
function pendingSlotLabelsForToday(
  task: ParsedTask,
  doneSlots: Set<string>,
  jerusalemWeekday: number
): JourneyTaskSlot[] {
  if (task.schedule === 'one_time') return [];
  if (task.schedule === 'weekly' && jerusalemWeekday !== task.weekly_day) return [];
  const expected = slotsForSchedule(task.schedule, task.times_per_day);
  return expected.filter((s) => !doneSlots.has(s));
}

/** הרגלים שבוצעו היום — לפי משימות (לא checkbox ידני). */
function habitsDoneTodayFromTaskRows(
  rows: ProgressRow[],
  userTodayDone: ReadonlyMap<string, ReadonlySet<string>>,
  todayKey: string
): Set<string> {
  const done = new Set<string>();
  for (const r of rows) {
    if (!r.journey_steps) continue;
    const habits = parseJourneyHabitsJson(r.journey_steps.habits);
    const tasks = parseJourneyTasksFull(r.journey_steps.tasks);
    const statuses = asStatusMap(r.task_statuses);
    const executions: Array<{ task_id: string; date_key: string; slot: string }> = [];
    for (const [taskId, slots] of userTodayDone) {
      for (const slot of slots) {
        executions.push({ task_id: taskId, date_key: todayKey, slot });
      }
    }
    for (const h of habits) {
      if (
        isHabitDoneTodayFromTasks(tasks, statuses as Record<string, { status?: string; execution_done?: boolean }>, executions, todayKey)
      ) {
        done.add(h.id);
      }
    }
  }
  return done;
}

function asStatusMap(raw: unknown): Record<string, TaskStatusEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, TaskStatusEntry>;
}

/**
 * מזהה משימות שהמשתמש סימן `accepted` ועדיין לא בוצעו בחלון הנוכחי.
 *  - one_time:  `execution_done !== true`
 *  - daily / weekly / per_meal / multi_daily: לפי `today_task_executions` של היום
 *    (כל הסלוטים הנדרשים בוצעו → לא pending; אחרת — pending עם רמז על
 *    הסלוטים שעוד פתוחים).
 */
export function collectPendingAcceptedTasks(
  rows: ProgressRow[],
  options: {
    todayDoneByTask?: ReadonlyMap<string, ReadonlySet<string>>;
    cronSlot?: HabitCheckpointSlot;
    jerusalemWeekday?: number;
  } = {}
): Array<{
  id: string;
  title: string;
  stepTitle: string | null;
  /** מחזיר רק אם זו משימה חוזרת — סלוטים שנשארו היום (לתצוגה ל-AI). */
  pendingSlots?: JourneyTaskSlot[];
  /** Label עברי קריא לסלוטים שעוד פתוחים — לפרומפט אלמוג. */
  pendingSlotLabels?: string[];
  /** Label עברי לתזמון ("3 פעמים ביום" / "לפני כל ארוחה"). */
  scheduleLabel?: string;
}> {
  const seen = new Set<string>();
  const out: Array<{
    id: string;
    title: string;
    stepTitle: string | null;
    pendingSlots?: JourneyTaskSlot[];
    pendingSlotLabels?: string[];
    scheduleLabel?: string;
  }> = [];

  const sortedByRecent = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const todayDone = options.todayDoneByTask;
  const cronSlot = options.cronSlot ?? 'morning';
  const weekday = options.jerusalemWeekday ?? 0;

  for (const r of sortedByRecent) {
    if (!r.journey_steps) continue;
    const tasks = parseJourneyTasksJson(r.journey_steps.tasks);
    if (tasks.length === 0) continue;
    const statuses = asStatusMap(r.task_statuses);
    const stepTitle = r.journey_steps.title?.trim() ?? null;
    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const s = statuses[t.id];
      if (!s) continue;
      if (s.status !== 'accepted') continue;
      if (s.execution_done === true) continue;
      if (t.schedule === 'one_time') {
        seen.add(t.id);
        out.push({ id: t.id, title: t.title, stepTitle });
        continue;
      }
      /** משימה חוזרת — בודק את הסלוטים שבוצעו היום. */
      const doneSlots = (todayDone?.get(t.id) ?? new Set<string>()) as Set<string>;
      const closed = isRecurringTaskClosedForSlot(t, doneSlots, cronSlot, weekday);
      if (closed) continue;
      const pending = pendingSlotLabelsForToday(t, doneSlots, weekday);
      seen.add(t.id);
      out.push({
        id: t.id,
        title: t.title,
        stepTitle,
        pendingSlots: pending.length > 0 ? pending : undefined,
        pendingSlotLabels:
          pending.length > 0
            ? pending.map((s) =>
                slotLabelHe(s, t.schedule === 'per_meal' ? t.meal_timing : undefined)
              )
            : undefined,
        scheduleLabel: scheduleLabelHe(
          t.schedule,
          t.times_per_day,
          t.weekly_day,
          t.meal_timing,
          t.meal_target
        ),
      });
    }
  }

  return out;
}

/**
 * משימות שבוצעו היום במלואן — מקור האמת לחיזוק חברי.
 *  - one_time: לפי `execution_done === true`.
 *  - חוזרות: לפי `today_task_executions` (כל הסלוטים של היום בוצעו).
 */
export function collectCompletedAcceptedTasks(
  rows: ProgressRow[],
  options: {
    todayDoneByTask?: ReadonlyMap<string, ReadonlySet<string>>;
    jerusalemWeekday?: number;
  } = {}
): Array<{ id: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string }> = [];
  const todayDone = options.todayDoneByTask;
  const weekday = options.jerusalemWeekday ?? 0;

  const sortedByRecent = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  for (const r of sortedByRecent) {
    if (!r.journey_steps) continue;
    const tasks = parseJourneyTasksJson(r.journey_steps.tasks);
    if (tasks.length === 0) continue;
    const statuses = asStatusMap(r.task_statuses);
    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const s = statuses[t.id];
      if (!s || s.status !== 'accepted') continue;
      if (t.schedule === 'one_time') {
        if (s.execution_done !== true) continue;
        seen.add(t.id);
        out.push({ id: t.id, title: t.title });
        continue;
      }
      /** משימה חוזרת — נחשבת "בוצעה היום" רק כשכל הסלוטים הנדרשים מוצו. */
      const doneSlots = (todayDone?.get(t.id) ?? new Set<string>()) as Set<string>;
      if (t.schedule === 'weekly' && weekday !== t.weekly_day) continue;
      const expected = slotsForSchedule(t.schedule, t.times_per_day);
      const allDone = expected.every((sl) => doneSlots.has(sl));
      if (!allDone) continue;
      seen.add(t.id);
      out.push({ id: t.id, title: t.title });
    }
  }

  return out;
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

/** הרגלים מצעדים שהושלמו + מכל הצעדים הפעילים (לא הושלמו) — לפי עדכון אחרון */
export function collectUserJourneyHabits(rows: ProgressRow[]): ParsedJourneyHabit[] {
  const byId = new Map<string, ParsedJourneyHabit>();

  for (const r of rows) {
    if (!r.journey_steps) continue;
    const habits = parseJourneyHabitsJson(r.journey_steps.habits);
    if (r.is_completed) {
      for (const h of habits) byId.set(h.id, h);
    }
  }

  const incomplete = [...rows]
    .filter((r) => !r.is_completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  for (const r of incomplete) {
    if (!r.journey_steps) continue;
    for (const h of parseJourneyHabitsJson(r.journey_steps.habits)) {
      byId.set(h.id, h);
    }
  }

  return [...byId.values()];
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

export type HabitCheckpointPlanItem = {
  userId: string;
  payload: AlmogHabitCheckpointPayload;
};

/* ============================================================
 * State machine רב-יומי — Dormancy tracking
 *
 *  משתמש "פעיל" אם profiles.last_active_at עודכן ב-24 השעות האחרונות
 *  (middleware מטריא אותו בכל בקשת API). כל חישוב ה-nudge יורד מזה.
 *  אנחנו לא מסתמכים על "האם המשתמש ענה לאלמוג" כי זה רעש; "המשתמש
 *  פתח את האפליקציה" = פעיל לכל דבר.
 * ============================================================ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** מחשב מספר ימים שלמים בין שני תאריכים. החזרה — מספר שלם >= 0. */
export function daysBetween(fromIso: string | null | undefined, now: Date): number {
  if (!fromIso) return Infinity;
  const fromMs = new Date(fromIso).getTime();
  if (!Number.isFinite(fromMs)) return Infinity;
  const diff = now.getTime() - fromMs;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Mapping של dormancy → nudge level (קריא ב-LLM וב-cron back-off).
 *  0: < 1d  (Active)     — שגרה רגילה
 *  1: 1–2d  (Slipping)   — הכרה עדינה (לא בשימוש כענף נפרד ב-LLM —
 *                          ה-prompt matrix משתמש ב-INTERDAY/INTRADAY)
 *  2: 3–6d  (Dormant)    — אפס לחץ
 *  3: >=7d  (Ghosted)    — back-off של שבוע
 */
export function computeNudgeLevel(daysSinceLastActive: number): HabitCheckpointNudgeLevel {
  if (!Number.isFinite(daysSinceLastActive) || daysSinceLastActive >= 7) return 3;
  if (daysSinceLastActive >= 3) return 2;
  if (daysSinceLastActive >= 1) return 1;
  return 0;
}

/**
 * True last-active per user = MAX של שלושה מקורות:
 *  1. profiles.last_active_at — מטריא middleware בכל request (כולל SW pings).
 *  2. ai_interactions.created_at where role='user' — כתיבה אמיתית בצ'אט.
 *  3. journey_task_executions.completed_at — סימון משימה ב-DB.
 *
 * מקור 1 לבדו לא אמין — Service Worker pings מסמנים "פעיל" גם כשהטלפון
 * זרוק בכיס. השאר הם פעולות יזומות, אז ה-MAX מבטיח שלא נתייחס למשתמש
 * כ-INTRADAY GHOSTING בזמן שהוא לא באמת פתח את האפליקציה.
 *
 * חלון 14 ימים — מספיק לכל ה-state machine (Ghosted מתחיל ב-7).
 */
const TRUE_ACTIVE_WINDOW_DAYS = 14;

export async function fetchTrueLastActiveByUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userIds: string[],
  now = new Date()
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (userIds.length === 0) return result;

  const cappedIds = userIds.slice(0, 2000);
  const windowIso = new Date(
    now.getTime() - TRUE_ACTIVE_WINDOW_DAYS * MS_PER_DAY
  ).toISOString();

  const [profileRes, chatRes, execRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, last_active_at')
      .in('id', cappedIds),
    admin
      .from('ai_interactions')
      .select('user_id, created_at')
      .in('user_id', cappedIds)
      .eq('role', 'user')
      .gte('created_at', windowIso)
      .order('created_at', { ascending: false })
      .limit(8000),
    admin
      .from('journey_task_executions')
      .select('user_id, completed_at')
      .in('user_id', cappedIds)
      .gte('completed_at', windowIso)
      .order('completed_at', { ascending: false })
      .limit(8000),
  ]);

  const upsertMax = (userId: string, iso: string | null | undefined) => {
    if (!userId || !iso) return;
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return;
    const current = result.get(userId);
    if (!current) {
      result.set(userId, iso);
      return;
    }
    if (new Date(current).getTime() < ms) {
      result.set(userId, iso);
    }
  };

  if (Array.isArray(profileRes?.data)) {
    for (const row of profileRes.data as Array<{ id?: string; last_active_at?: string | null }>) {
      if (typeof row.id === 'string') {
        result.set(row.id, row.last_active_at ?? null);
      }
    }
  }

  if (Array.isArray(chatRes?.data)) {
    for (const row of chatRes.data as Array<{ user_id?: string; created_at?: string | null }>) {
      if (typeof row.user_id === 'string') upsertMax(row.user_id, row.created_at);
    }
  }

  if (Array.isArray(execRes?.data)) {
    for (const row of execRes.data as Array<{ user_id?: string; completed_at?: string | null }>) {
      if (typeof row.user_id === 'string') upsertMax(row.user_id, row.completed_at);
    }
  }

  return result;
}

/**
 * סטטוס ביצוע מ-Supabase בלבד (SSOT).
 *  none    — שום משימה/הרגל לא נסגרו היום, ויש פתוחים.
 *  partial — חלק נסגרו, חלק עדיין פתוחים.
 *  full    — הכל נסגר היום (אין שום פתוח).
 */
export function computeCompletionStatus(args: {
  completedHabitsCount: number;
  completedTasksCount: number;
  pendingHabitsCount: number;
  pendingTasksCount: number;
}): HabitCheckpointCompletionStatus {
  const completed = args.completedHabitsCount + args.completedTasksCount;
  const pending = args.pendingHabitsCount + args.pendingTasksCount;
  if (completed === 0 && pending === 0) return 'none';
  if (pending === 0 && completed > 0) return 'full';
  if (completed > 0 && pending > 0) return 'partial';
  return 'none';
}

/**
 * מחשב למי לשלוח בדיקה בחלון הנתון — ללא קריאות AI (רק נתונים).
 *
 * מדלג על משתמש אם:
 *  - אין לו הרגלים תואמי slot באותו יום, **וגם**
 *  - אין לו משימות שהוא סימן כ-accepted אבל עדיין לא דיווח על ביצוע.
 *
 * מי שיש לו משימות פתוחות יקבל התראה גם בלי הרגלים תואמי slot — האחריות
 * של הזרימה הזו היא לעודד למלא את מה שכבר הסכים לו.
 *
 * `lastActiveByUser` — Map מ-userId ל-ISO של profiles.last_active_at. מי שלא
 * מופיע יסומן Ghosted (nudgeLevel=3). ה-cron route אחראי להחיל back-off של
 * שבוע על Ghosted לפני הטריגר ל-Workflow.
 */
export function planHabitCheckpointTriggers(
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date,
  todayExecutionsByUser: TodayExecutionsByUser = new Map(),
  lastActiveByUser: ReadonlyMap<string, string | null> = new Map()
): HabitCheckpointPlanItem[] {
  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const byUser = new Map<string, ProgressRow[]>();

  for (const row of progressRows) {
    const uid = row.user_id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(row);
  }

  const out: HabitCheckpointPlanItem[] = [];

  for (const [userId, rows] of byUser) {
    const userTodayDone = todayExecutionsByUser.get(userId) ?? new Map<string, Set<string>>();
    const habits = collectUserJourneyHabits(rows);
    const slotHabits = habits.length > 0 ? filterHabitsForSlot(habits, slot, weekday) : [];
    const habitsDoneToday = habitsDoneTodayFromTaskRows(rows, userTodayDone, dateKey);
    /** תאימות לאחור: סימון ידני ישן ב-habits_progress */
    for (const id of mergeHabitsDoneTodayFromRows(rows)) habitsDoneToday.add(id);
    const due = slotHabits.filter((h) => !habitsDoneToday.has(h.id));
    const completedTodayHabits = habits
      .filter((h) => habitsDoneToday.has(h.id))
      .map((h) => ({ id: h.id, title: h.title }));
    const pendingTasks = collectPendingAcceptedTasks(rows, {
      todayDoneByTask: userTodayDone,
      cronSlot: slot,
      jerusalemWeekday: weekday,
    });
    const completedTodayTasks = collectCompletedAcceptedTasks(rows, {
      todayDoneByTask: userTodayDone,
      jerusalemWeekday: weekday,
    });

    const hasRemindWork = due.length > 0 || pendingTasks.length > 0;
    const hasReinforceCompletion =
      !hasRemindWork && (completedTodayHabits.length > 0 || completedTodayTasks.length > 0);

    if (!hasRemindWork && !hasReinforceCompletion) continue;

    const display = pickDisplayRow(rows);
    const stepTitle = display?.journey_steps?.title?.trim() ?? null;
    const stationTitle = stationTitleFromJoin(display?.journey_steps?.journey_stations);

    const daysSinceLastActive = daysBetween(lastActiveByUser.get(userId) ?? null, now);
    const nudgeLevel = computeNudgeLevel(daysSinceLastActive);
    const completionStatus = computeCompletionStatus({
      completedHabitsCount: completedTodayHabits.length,
      completedTasksCount: completedTodayTasks.length,
      pendingHabitsCount: due.length,
      pendingTasksCount: pendingTasks.length,
    });

    out.push({
      userId,
      payload: {
        userId,
        slot,
        checkpointDate: dateKey,
        notifyMode: hasRemindWork ? 'remind' : 'reinforce',
        reinforceKind: hasRemindWork ? undefined : 'completion',
        habits: due.map((h) => ({
          id: h.id,
          title: h.title,
          frequency: h.frequency,
        })),
        pendingTasks: pendingTasks.map((t) => ({
          id: t.id,
          title: t.title,
          stepTitle: t.stepTitle,
          scheduleLabel: t.scheduleLabel,
          pendingSlotLabels: t.pendingSlotLabels,
        })),
        completedTodayHabits,
        completedTodayTasks,
        stepTitle,
        stationTitle,
        nudgeLevel,
        daysSinceLastActive: Number.isFinite(daysSinceLastActive)
          ? Math.min(3650, daysSinceLastActive)
          : 3650,
        completionStatus,
      },
    });
  }

  return out;
}

/**
 * חיזוק נוכחות: דיברו בצ'אט היום, אין תזכורת פתוחה — מגע חברי (לא גנרי).
 */
export function appendPresenceReinforceFromChat(
  plan: HabitCheckpointPlanItem[],
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date,
  chatUserIds: Set<string>,
  todayExecutionsByUser: TodayExecutionsByUser = new Map(),
  lastActiveByUser: ReadonlyMap<string, string | null> = new Map()
): HabitCheckpointPlanItem[] {
  if (chatUserIds.size === 0) return plan;

  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const planned = new Set(plan.map((p) => p.userId));
  const byUser = new Map<string, ProgressRow[]>();

  for (const row of progressRows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  const extra: HabitCheckpointPlanItem[] = [];

  for (const userId of chatUserIds) {
    if (planned.has(userId)) continue;
    const rows = byUser.get(userId);
    if (!rows?.length) continue;

    const habits = collectUserJourneyHabits(rows);
    if (habits.length === 0) continue;

    const userTodayDone = todayExecutionsByUser.get(userId) ?? new Map<string, Set<string>>();
    const pendingTasks = collectPendingAcceptedTasks(rows, {
      todayDoneByTask: userTodayDone,
      cronSlot: slot,
      jerusalemWeekday: weekday,
    });
    if (pendingTasks.length > 0) continue;

    const habitsDoneToday = habitsDoneTodayFromTaskRows(rows, userTodayDone, dateKey);
    for (const id of mergeHabitsDoneTodayFromRows(rows)) habitsDoneToday.add(id);
    const slotHabits = filterHabitsForSlot(habits, slot, weekday);
    const due = slotHabits.filter((h) => !habitsDoneToday.has(h.id));
    if (due.length > 0) continue;

    const display = pickDisplayRow(rows);
    const completedTodayHabits = habits
      .filter((h) => habitsDoneToday.has(h.id))
      .map((h) => ({ id: h.id, title: h.title }));
    const completedTodayTasks = collectCompletedAcceptedTasks(rows, {
      todayDoneByTask: userTodayDone,
      jerusalemWeekday: weekday,
    });
    const daysSinceLastActive = daysBetween(lastActiveByUser.get(userId) ?? null, now);
    const nudgeLevel = computeNudgeLevel(daysSinceLastActive);
    /** presence = יש שיחה היום => הוא פעיל וגם אין פתוחים => full. */
    const completionStatus: HabitCheckpointCompletionStatus =
      completedTodayHabits.length + completedTodayTasks.length > 0 ? 'full' : 'none';

    extra.push({
      userId,
      payload: {
        userId,
        slot,
        checkpointDate: dateKey,
        notifyMode: 'reinforce',
        reinforceKind: 'presence',
        habits: [],
        pendingTasks: [],
        completedTodayHabits,
        completedTodayTasks,
        stepTitle: display?.journey_steps?.title?.trim() ?? null,
        stationTitle: stationTitleFromJoin(display?.journey_steps?.journey_stations),
        nudgeLevel,
        daysSinceLastActive: Number.isFinite(daysSinceLastActive)
          ? Math.min(3650, daysSinceLastActive)
          : 3650,
        completionStatus,
      },
    });
    planned.add(userId);
  }

  return extra.length > 0 ? [...plan, ...extra] : plan;
}

/** תכנון מלא כולל חיזוק נוכחות לפי צ'אט היום. */
export async function planHabitCheckpointTriggersWithChat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date,
  todayExecutionsByUser: TodayExecutionsByUser = new Map(),
  lastActiveByUser: ReadonlyMap<string, string | null> = new Map()
): Promise<HabitCheckpointPlanItem[]> {
  const base = planHabitCheckpointTriggers(
    progressRows,
    slot,
    now,
    todayExecutionsByUser,
    lastActiveByUser
  );
  const chatIds = await fetchUserIdsWithChatToday(admin, now);
  return appendPresenceReinforceFromChat(
    base,
    progressRows,
    slot,
    now,
    chatIds,
    todayExecutionsByUser,
    lastActiveByUser
  );
}
