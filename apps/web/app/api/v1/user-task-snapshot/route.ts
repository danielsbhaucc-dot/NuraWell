import { NextResponse } from 'next/server';
import { requireApiSession } from '../../../../lib/api/route-guards';
import {
  type JourneyReportStepShape,
} from '../../../../lib/journey/journey-report-parse';
import { jerusalemDateKey } from '../../../../lib/journey/task-schedule';
import { buildUserTaskSnapshot } from '../../../../lib/tasks/user-task-ssot';
import {
  genderDisplayLabel,
  resolveDisplayWeightKg,
} from '../../../../lib/profile/profile-field-ssot';

type JourneyStepRow = {
  id?: string;
  title?: string | null;
  step_number?: number | null;
  tasks?: unknown;
};

type JourneyProgressRow = {
  step_id: string;
  task_statuses?: Record<string, { status?: string }> | null;
};

/** ממפה שורות DB לצורת הצעד ש־SSOT מצפה לה — בלי cast עיוור. */
function toJourneyReportSteps(
  stepRows: JourneyStepRow[] | null | undefined,
  progressRows: JourneyProgressRow[] | null | undefined
): JourneyReportStepShape[] {
  const progByStep = new Map(
    (progressRows ?? []).map((p) => [p.step_id, p])
  );
  const steps: JourneyReportStepShape[] = [];
  for (const row of stepRows ?? []) {
    if (
      typeof row.id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.step_number !== 'number'
    ) {
      continue;
    }
    const prog = progByStep.get(row.id);
    steps.push({
      id: row.id,
      title: row.title,
      step_number: row.step_number,
      tasks: row.tasks ?? null,
      progress: prog
        ? { task_statuses: prog.task_statuses ?? undefined }
        : null,
    });
  }
  return steps;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOURNEY_PROGRESS_SELECT =
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, habit_meta, task_level_meta, is_completed, completed_at, last_section';

const JOURNEY_PROGRESS_SELECT_FALLBACKS = [
  JOURNEY_PROGRESS_SELECT,
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, habit_meta, is_completed, completed_at, last_section',
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, is_completed, completed_at, last_section',
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, is_completed, completed_at',
];

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist/i.test(error.message ?? '')
  );
}

async function fetchJourneyProgressWithFallbacks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
) {
  let lastError: { code?: string; message?: string } | null = null;
  for (const select of JOURNEY_PROGRESS_SELECT_FALLBACKS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
      .from('journey_progress')
      .select(select)
      .eq('user_id', userId);

    if (!error) return { data, error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
}

/**
 * צילום מצב מאוחד למשימות + שדות פרופיל בסיסיים.
 * בית / תוכנית / מסע / היסטוריה צריכים לקרוא מונים מ־`counts.unified`.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const todayKey = jerusalemDateKey();

    const [
      stepsRes,
      progressRes,
      execRes,
      almogActiveRes,
      almogCompletedRes,
      almogDroppedRes,
      profileRes,
      measurementRes,
    ] = await Promise.all([
      supabase
        .from('journey_steps')
        .select('id, title, step_number, tasks, habits')
        .eq('is_published', true)
        .order('step_number'),
      fetchJourneyProgressWithFallbacks(supabase, user.id),
      supabase
        .from('journey_task_executions')
        .select('step_id, task_id, slot, completed_at, date_key, source, outcome')
        .eq('user_id', user.id)
        .eq('date_key', todayKey)
        .limit(500),
      supabase
        .from('almog_assignments')
        .select('id, title, status, schedule')
        .eq('user_id', user.id)
        .in('status', ['active', 'frozen'])
        .order('given_at', { ascending: false })
        .limit(40),
      supabase
        .from('almog_assignments')
        .select('id, title, status, schedule')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('last_done_at', { ascending: false, nullsFirst: false })
        .limit(40),
      supabase
        .from('almog_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'dropped'),
      supabase
        .from('profiles')
        .select('gender, current_weight_kg, wake_up_time, sleep_time, meal_count, meal_schedule')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('user_measurements')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (stepsRes.error) {
      return NextResponse.json({ error: 'Failed to load steps' }, { status: 500 });
    }
    if (progressRes.error) {
      return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
    }

    const steps = toJourneyReportSteps(
      stepsRes.data as JourneyStepRow[] | null,
      progressRes.data as JourneyProgressRow[] | null
    );

    const snapshot = buildUserTaskSnapshot({
      steps,
      todayExecutions: execRes.data ?? [],
      todayDateKey: todayKey,
      almogAssignments: almogActiveRes.data ?? [],
      almogCompleted: almogCompletedRes.data ?? [],
      almogDroppedCount: almogDroppedRes.count ?? 0,
    });

    const profile = profileRes.data as {
      gender?: 'male' | 'female' | null;
      current_weight_kg?: number | null;
      wake_up_time?: string | null;
      sleep_time?: string | null;
      meal_count?: number | null;
      meal_schedule?: unknown;
    } | null;
    const latestKg =
      typeof measurementRes.data?.weight_kg === 'number'
        ? measurementRes.data.weight_kg
        : null;
    const displayWeightKg = resolveDisplayWeightKg(profile?.current_weight_kg, latestKg);
    const wake = profile?.wake_up_time ? String(profile.wake_up_time).slice(0, 5) : null;
    const sleep = profile?.sleep_time ? String(profile.sleep_time).slice(0, 5) : null;

    return NextResponse.json({
      today_date_key: todayKey,
      counts: snapshot.counts,
      journey_today: snapshot.journeyToday,
      almog_open: snapshot.almogOpen,
      user_schedule: {
        wake_up_time: wake,
        sleep_time: sleep,
        meal_count: typeof profile?.meal_count === 'number' ? profile.meal_count : null,
        meal_schedule: Array.isArray(profile?.meal_schedule) ? profile.meal_schedule : null,
      },
      profile: {
        gender: profile?.gender ?? null,
        gender_label: genderDisplayLabel(profile?.gender ?? null) || null,
        current_weight_kg: displayWeightKg,
        wake_up_time: wake,
        sleep_time: sleep,
      },
      /** שדות להשוואת E2E בין מסכים — אותם מונים בכל קריאה. */
      screen_counters: {
        home_due_today: snapshot.counts.unified.dueToday,
        home_done_today: snapshot.counts.unified.doneToday,
        home_pending_today: snapshot.counts.unified.pendingToday,
        plans_almog_active: snapshot.counts.almog.active,
        journey_almog_open: snapshot.counts.almog.active,
        history_rejected: snapshot.counts.unified.rejected,
        history_completed: snapshot.counts.unified.completed,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
