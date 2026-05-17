import { parseJourneyReportItems } from '@/lib/journey/journey-report-parse';

export type AdminUserJourneyTaskRow = {
  id: string;
  title: string;
  status: 'accepted' | 'rejected' | 'pending' | 'none';
  execution_done: boolean;
};

export type AdminUserJourneyHabitRow = {
  id: string;
  title: string;
  checked: number;
  total: number;
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
  };
};

type ProgressRow = {
  step_id: string;
  is_completed?: boolean;
  task_statuses?: Record<string, { status?: string; execution_done?: boolean }> | null;
  habits_progress?: Record<string, boolean[]> | null;
  last_section?: string | null;
  updated_at?: string | null;
  video_watched?: boolean;
  quiz_score?: number | null;
  commitment_accepted?: boolean;
};

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

/** מיזוג journey_steps + journey_progress למסך Ops — משתמש אחד */
export async function buildAdminUserJourneyReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string
): Promise<AdminUserJourneyReport> {
  const [{ data: rawSteps }, { data: rawProgress }] = await Promise.all([
    admin
      .from('journey_steps')
      .select('id, title, step_number, is_published, station_id, tasks, habits, journey_stations(id, title, sort_order)')
      .order('step_number', { ascending: true }),
    admin
      .from('journey_progress')
      .select(
        'step_id, is_completed, task_statuses, habits_progress, last_section, updated_at, video_watched, quiz_score, commitment_accepted'
      )
      .eq('user_id', userId),
  ]);

  const progByStep = new Map<string, ProgressRow>(
    (rawProgress ?? []).map((p: ProgressRow) => [p.step_id, p])
  );

  let journey_steps_tracked = 0;
  let journey_steps_completed = 0;
  let tasks_accepted = 0;
  let habits_tracked = 0;

  const steps: AdminUserJourneyStepRow[] = (rawSteps ?? []).map((s: StepRow) => {
    const prog = progByStep.get(s.id) ?? null;
    const started = Boolean(prog);
    const ts = (prog?.task_statuses ?? {}) as Record<
      string,
      { status?: string; execution_done?: boolean }
    >;
    const hp = (prog?.habits_progress ?? {}) as Record<string, boolean[]>;

    const taskDefs = parseJourneyReportItems(s.tasks);
    const habitDefs = parseJourneyReportItems(s.habits);

    const tasks: AdminUserJourneyTaskRow[] = taskDefs.map((t) => {
      const status = taskStatus(t.id, ts);
      if (status === 'accepted') tasks_accepted++;
      return {
        id: t.id,
        title: t.title,
        status,
        execution_done: ts[t.id]?.execution_done === true,
      };
    });

    const habits: AdminUserJourneyHabitRow[] = habitDefs.map((h) => {
      const arr = hp[h.id] ?? [];
      if (arr.length > 0) habits_tracked++;
      const checked = arr.filter(Boolean).length;
      return {
        id: h.id,
        title: h.title,
        checked,
        total: arr.length,
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
    },
  };
}
