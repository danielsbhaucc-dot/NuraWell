import { parseJourneyReportItems, parseJourneyTasksFull } from '@/lib/journey/journey-report-parse';
import {
  isTaskActiveToday,
  jerusalemDateKey,
  resolveTaskSchedule,
} from '@/lib/journey/task-schedule';
import type { JourneyTask } from '@/lib/types/journey';

/** היסטוריית ביצוע משימה — שורה אחת לכל יום שבו היה לפחות slot אחד. */
export type AdminUserTaskExecutionDay = {
  date_key: string;
  slot_count: number;
  slots: string[];
};

export type AdminUserJourneyTaskRow = {
  id: string;
  title: string;
  status: 'accepted' | 'rejected' | 'pending' | 'none';
  execution_done: boolean;
  /** מתי לחץ "מקובל עליי" — ISO (task_statuses.decided_at) */
  accepted_at: string | null;
  /** ISO של הביצוע הראשון אי-פעם */
  first_execution_at: string | null;
  /** ISO של הביצוע האחרון אי-פעם */
  last_execution_at: string | null;
  /** ביצועים של 30 ימים אחרונים (לוח ירושלים) — מסודר מהחדש לישן */
  recent_executions: AdminUserTaskExecutionDay[];
  /** כמה ימים פעילים מתוך 7 הימים האחרונים */
  active_days_last_7: number;
  /** כמה ימים פעילים מתוך 30 הימים האחרונים */
  active_days_last_30: number;
  /** ימים שהיו אמורים להתבצע ב-30 ימים אחרונים אך לא בוצעו */
  missed_days_last_30: number;
  /** סך-הכל ביצועים מתועדים בטווח 30 הימים */
  total_executions_last_30: number;
};

export type AdminUserJourneyHabitRow = {
  id: string;
  title: string;
  checked: number;
  total: number;
  /** רצף נוכחי מ-habit_meta (000024_habit_meta_*) */
  streak_current: number;
  /** שיא רצף מ-habit_meta */
  streak_best: number;
  /** מטרת ימים אם הוגדרה */
  target_days: number | null;
  /** האם הושג היעד (achieved_at קיים ב-habit_meta) */
  achieved: boolean;
};

export type AdminUserJourneyStepRow = {
  id: string;
  title: string;
  step_number: number;
  is_published: boolean;
  station_id: string | null;
  station_title: string;
  station_sort_order: number;
  started: boolean;
  is_completed: boolean;
  last_section: string | null;
  updated_at: string | null;
  video_watched: boolean;
  quiz_score: number | null;
  commitment_accepted: boolean;
  tasks: AdminUserJourneyTaskRow[];
  habits: AdminUserJourneyHabitRow[];
};

export type AdminUserJourneyReport = {
  steps: AdminUserJourneyStepRow[];
  stats: {
    journey_steps_tracked: number;
    journey_steps_completed: number;
    tasks_accepted: number;
    habits_tracked: number;
    /** סה"כ ביצועי משימות מתועדים ב-30 הימים האחרונים */
    total_task_executions_last_30: number;
    /** מספר הימים הפעילים (לפחות ביצוע אחד) ב-30 הימים האחרונים */
    active_days_last_30: number;
  };
};

type HabitMetaEntry = {
  target_days?: number | null;
  streak_current?: number | null;
  streak_best?: number | null;
  achieved_at?: string | null;
  extended_by?: number | null;
};

type ProgressRow = {
  step_id: string;
  is_completed?: boolean;
  task_statuses?: Record<
    string,
    { status?: string; execution_done?: boolean; decided_at?: string | null }
  > | null;
  habits_progress?: Record<string, boolean[]> | null;
  habit_meta?: Record<string, HabitMetaEntry> | null;
  last_section?: string | null;
  updated_at?: string | null;
  video_watched?: boolean;
  quiz_score?: number | null;
  commitment_accepted?: boolean;
};

type ExecutionRow = {
  step_id: string;
  task_id: string;
  date_key: string;
  slot: string;
  completed_at?: string;
};

/** האם משימה הייתה אמורה להתבצע ביום dateKey (אחרי קבלה)? */
function isTaskDueOnDateKey(
  task: JourneyTask,
  dateKey: string,
  acceptedDateKey: string | null
): boolean {
  if (acceptedDateKey && dateKey < acceptedDateKey) return false;
  const { schedule } = resolveTaskSchedule(task);
  if (schedule === 'one_time') return false;
  if (schedule === 'weekly') {
    const [y, m, d] = dateKey.split('-').map((s) => Number.parseInt(s, 10));
    if (!y || !m || !d) return false;
    return isTaskActiveToday(task, new Date(Date.UTC(y, m - 1, d)));
  }
  return true;
}

/** בונה רשימת 30 הימים האחרונים בלוח ירושלים (החדש ביותר ראשון) */
function buildRecent30DayKeys(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(jerusalemDateKey(d));
  }
  return out;
}

type StepRow = {
  id: string;
  title: string;
  step_number: number;
  is_published: boolean;
  station_id?: string | null;
  tasks: unknown;
  habits: unknown;
  journey_stations?: { id: string; title: string; sort_order: number } | null;
};

function taskStatus(
  taskId: string,
  ts: Record<string, { status?: string; execution_done?: boolean }> | null | undefined
): AdminUserJourneyTaskRow['status'] {
  const st = ts?.[taskId]?.status;
  if (st === 'accepted' || st === 'rejected' || st === 'pending') return st;
  return 'none';
}

/**
 * מיזוג journey_steps + journey_progress + journey_task_executions + habit_meta
 * לדו"ח התקדמות מלא של משתמש אחד.
 *
 * נקרא ע"י:
 *   - Ops (אדמין): /api/v1/admin/users/[userId] → AdminUserJourneyDetail
 *   - AI Chat: כדי להזריק הקשר התקדמות מלא ל-Almog (קריאה בלבד)
 *
 * המקור לביצועים בפועל (היסטוריה רב-יומית) הוא journey_task_executions,
 * לא JSONB ישן ב-task_statuses. ה-streak להרגלים מגיע מ-habit_meta.
 */
export async function buildAdminUserJourneyReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string
): Promise<AdminUserJourneyReport> {
  const recentKeys = buildRecent30DayKeys();
  const sinceKey = recentKeys[recentKeys.length - 1];
  const recentKeySet = new Set(recentKeys);
  const last7KeySet = new Set(recentKeys.slice(0, 7));

  const [{ data: rawSteps }, { data: rawProgress }, { data: rawExecutions }] = await Promise.all([
    admin
      .from('journey_steps')
      .select('id, title, step_number, is_published, station_id, tasks, habits, journey_stations(id, title, sort_order)')
      .order('step_number', { ascending: true }),
    admin
      .from('journey_progress')
      .select(
        'step_id, is_completed, task_statuses, habits_progress, habit_meta, last_section, updated_at, video_watched, quiz_score, commitment_accepted'
      )
      .eq('user_id', userId),
    admin
      .from('journey_task_executions')
      .select('step_id, task_id, date_key, slot, completed_at')
      .eq('user_id', userId)
      .gte('date_key', sinceKey)
      .order('completed_at', { ascending: true })
      .limit(5000),
  ]);

  const progByStep = new Map<string, ProgressRow>(
    (rawProgress ?? []).map((p: ProgressRow) => [p.step_id, p])
  );

  /** index: stepId -> taskId -> dateKey -> slot[] */
  const execIndex = new Map<string, Map<string, Map<string, string[]>>>();
  /** taskId -> { first, last } ISO timestamps (כל ההיסטוריה בטווח השאילתה) */
  const execTimestampsByTask = new Map<string, { first: string; last: string }>();
  const activeDaysAggregate = new Set<string>();
  let totalTaskExecutionsLast30 = 0;

  for (const row of (rawExecutions ?? []) as ExecutionRow[]) {
    if (!recentKeySet.has(row.date_key)) continue;
    totalTaskExecutionsLast30++;
    activeDaysAggregate.add(row.date_key);

    if (row.completed_at) {
      const prev = execTimestampsByTask.get(row.task_id);
      if (!prev) {
        execTimestampsByTask.set(row.task_id, {
          first: row.completed_at,
          last: row.completed_at,
        });
      } else {
        if (row.completed_at < prev.first) prev.first = row.completed_at;
        if (row.completed_at > prev.last) prev.last = row.completed_at;
      }
    }

    let byTask = execIndex.get(row.step_id);
    if (!byTask) {
      byTask = new Map();
      execIndex.set(row.step_id, byTask);
    }
    let byDay = byTask.get(row.task_id);
    if (!byDay) {
      byDay = new Map();
      byTask.set(row.task_id, byDay);
    }
    const slots = byDay.get(row.date_key) ?? [];
    if (!slots.includes(row.slot)) {
      slots.push(row.slot);
      byDay.set(row.date_key, slots);
    }
  }

  let journey_steps_tracked = 0;
  let journey_steps_completed = 0;
  let tasks_accepted = 0;
  let habits_tracked = 0;

  const steps: AdminUserJourneyStepRow[] = (rawSteps ?? []).map((s: StepRow) => {
    const prog = progByStep.get(s.id) ?? null;
    const started = Boolean(prog);
    const ts = (prog?.task_statuses ?? {}) as Record<
      string,
      { status?: string; execution_done?: boolean; decided_at?: string | null }
    >;
    const hp = (prog?.habits_progress ?? {}) as Record<string, boolean[]>;
    const hm = (prog?.habit_meta ?? {}) as Record<string, HabitMetaEntry>;
    const stepExec = execIndex.get(s.id);

    const taskDefsFull = parseJourneyTasksFull(s.tasks);
    const habitDefs = parseJourneyReportItems(s.habits);

    const tasks: AdminUserJourneyTaskRow[] = taskDefsFull.map((t) => {
      const status = taskStatus(t.id, ts);
      if (status === 'accepted') tasks_accepted++;

      const accepted_at = ts[t.id]?.decided_at ?? null;
      const acceptedDateKey = accepted_at
        ? jerusalemDateKey(new Date(accepted_at))
        : null;
      const timestamps = execTimestampsByTask.get(t.id);

      const taskExec = stepExec?.get(t.id);
      const recent_executions: AdminUserTaskExecutionDay[] = [];
      let active_days_last_7 = 0;
      let active_days_last_30 = 0;
      let missed_days_last_30 = 0;
      let total_executions_last_30 = 0;

      for (const dateKey of recentKeys) {
        const slots = taskExec?.get(dateKey);
        const hasExec = Boolean(slots && slots.length > 0);
        const wasDue =
          status === 'accepted' && isTaskDueOnDateKey(t, dateKey, acceptedDateKey);

        if (hasExec && slots) {
          recent_executions.push({
            date_key: dateKey,
            slot_count: slots.length,
            slots: [...slots],
          });
          active_days_last_30++;
          total_executions_last_30 += slots.length;
          if (last7KeySet.has(dateKey)) active_days_last_7++;
        } else if (wasDue) {
          missed_days_last_30++;
        }
      }

      return {
        id: t.id,
        title: t.title,
        status,
        execution_done: ts[t.id]?.execution_done === true,
        accepted_at,
        first_execution_at: timestamps?.first ?? null,
        last_execution_at: timestamps?.last ?? null,
        recent_executions,
        active_days_last_7,
        active_days_last_30,
        missed_days_last_30,
        total_executions_last_30,
      };
    });

    const habits: AdminUserJourneyHabitRow[] = habitDefs.map((h) => {
      const arr = hp[h.id] ?? [];
      if (arr.length > 0) habits_tracked++;
      const checked = arr.filter(Boolean).length;
      const meta = hm[h.id] ?? {};

      return {
        id: h.id,
        title: h.title,
        checked,
        total: arr.length,
        streak_current: Math.max(0, Number(meta.streak_current ?? 0)),
        streak_best: Math.max(0, Number(meta.streak_best ?? 0)),
        target_days:
          meta.target_days != null && Number.isFinite(Number(meta.target_days))
            ? Number(meta.target_days)
            : null,
        achieved: typeof meta.achieved_at === 'string' && meta.achieved_at.length > 0,
      };
    });

    if (started) journey_steps_tracked++;
    if (prog?.is_completed) journey_steps_completed++;

    const station = s.journey_stations;

    return {
      id: s.id,
      title: s.title,
      step_number: s.step_number,
      is_published: s.is_published,
      station_id: s.station_id ?? station?.id ?? null,
      station_title: station?.title ?? 'ללא תחנה',
      station_sort_order: station?.sort_order ?? 9999,
      started,
      is_completed: prog?.is_completed === true,
      last_section: prog?.last_section ?? null,
      updated_at: prog?.updated_at ?? null,
      video_watched: prog?.video_watched === true,
      quiz_score: prog?.quiz_score ?? null,
      commitment_accepted: prog?.commitment_accepted === true,
      tasks,
      habits,
    };
  });

  return {
    steps,
    stats: {
      journey_steps_tracked,
      journey_steps_completed,
      tasks_accepted,
      habits_tracked,
      total_task_executions_last_30: totalTaskExecutionsLast30,
      active_days_last_30: activeDaysAggregate.size,
    },
  };
}
