import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { getCelebrationForTask } from '@/lib/challenge/celebrations';
import {
  buildChallengeState,
  getCompletionsForDay,
  getTodayTasks,
  getUserEnrollment,
} from '@/lib/challenge/enrollment';
import { getEatingWindowStatus } from '@/lib/challenge/eating-window-status';
import {
  countRequiredCompletionsForDay,
  isPerMealTaskFullyComplete,
  resolveTaskSlots,
} from '@/lib/challenge/task-slots';
import { currentChallengeDayIndex } from '@/lib/challenge/start-date';
import type { EatingWindowConfig } from '@/lib/challenge/types';
import type { UserScheduleProfile } from '@/lib/journey/profile-schedule';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const dayIndex = currentChallengeDayIndex(
    enrollment.challenge_start_date,
    enrollment.challenge_end_date,
    new Date(),
    enrollment.demo_simulated_day,
  );

  if (dayIndex <= 0) {
    return NextResponse.json({ tasks: [], day_index: 0, completions: [] });
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('wake_up_time, sleep_time, meal_count, meal_schedule')
    .eq('id', auth.user.id)
    .single();

  const scheduleProfile: UserScheduleProfile = {
    wake_up_time: profile?.wake_up_time as string | null,
    sleep_time: profile?.sleep_time as string | null,
    meal_count: profile?.meal_count as number | null,
    meal_schedule: profile?.meal_schedule as UserScheduleProfile['meal_schedule'],
  };

  const [tasks, completions] = await Promise.all([
    getTodayTasks(auth.supabase, enrollment, dayIndex),
    getCompletionsForDay(auth.supabase, enrollment.id, dayIndex),
  ]);

  const eatingWindow = enrollment.eating_window as EatingWindowConfig | null;

  return NextResponse.json({
    day_index: dayIndex,
    tasks: tasks.map((t) => {
      const taskCompletions = completions.filter((c) => c.task_definition_id === t.id);
      const completedSlotKeys = new Set(
        taskCompletions.map((c) => c.slot_key).filter((k): k is string => Boolean(k)),
      );
      const slots = resolveTaskSlots(t, scheduleProfile, completedSlotKeys);
      const completed =
        t.schedule_type === 'per_meal'
          ? isPerMealTaskFullyComplete(slots)
          : taskCompletions.length > 0;

      return {
        ...t,
        completed,
        slots: t.schedule_type === 'per_meal' ? slots : undefined,
        completion: taskCompletions[0] ?? null,
      };
    }),
    eating_window_status: eatingWindow ? getEatingWindowStatus(eatingWindow) : null,
    state: buildChallengeState(enrollment),
  });
}

const completeSchema = z.object({
  task_definition_id: z.string().uuid(),
  slot_key: z.string().max(64).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = completeSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const dayIndex = currentChallengeDayIndex(
    enrollment.challenge_start_date,
    enrollment.challenge_end_date,
    new Date(),
    enrollment.demo_simulated_day,
  );

  if (dayIndex <= 0) {
    return NextResponse.json({ error: 'Challenge not active yet' }, { status: 403 });
  }

  const { data: taskDef } = await auth.supabase
    .from('challenge_task_definitions')
    .select('id, campaign_id, day_index, task_key, schedule_type, celebration_key')
    .eq('id', parsed.data.task_definition_id)
    .eq('campaign_id', enrollment.campaign_id)
    .eq('day_index', dayIndex)
    .maybeSingle();

  if (!taskDef) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const slotKey = parsed.data.slot_key ?? null;

  if (taskDef.schedule_type === 'per_meal' && !slotKey) {
    return NextResponse.json({ error: 'slot_key required for per_meal task' }, { status: 400 });
  }

  const slotQuery = auth.supabase
    .from('challenge_task_completions')
    .select('*')
    .eq('enrollment_id', enrollment.id)
    .eq('task_definition_id', parsed.data.task_definition_id)
    .eq('day_index', dayIndex);

  const { data: existing } = slotKey
    ? await slotQuery.eq('slot_key', slotKey).maybeSingle()
    : await slotQuery.is('slot_key', null).maybeSingle();

  let completion = existing;
  if (!existing) {
    const { data: inserted, error } = await auth.supabase
      .from('challenge_task_completions')
      .insert({
        enrollment_id: enrollment.id,
        task_definition_id: parsed.data.task_definition_id,
        user_id: auth.user.id,
        day_index: dayIndex,
        slot_key: slotKey,
        completed_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    completion = inserted;
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('wake_up_time, sleep_time, meal_count, meal_schedule')
    .eq('id', auth.user.id)
    .single();

  const scheduleProfile: UserScheduleProfile = {
    wake_up_time: profile?.wake_up_time as string | null,
    sleep_time: profile?.sleep_time as string | null,
    meal_count: profile?.meal_count as number | null,
    meal_schedule: profile?.meal_schedule as UserScheduleProfile['meal_schedule'],
  };

  const dayTasks = await getTodayTasks(auth.supabase, enrollment, dayIndex);
  const requiredTotal = countRequiredCompletionsForDay(dayTasks, scheduleProfile);

  const { count: dayDone } = await auth.supabase
    .from('challenge_task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollment.id)
    .eq('day_index', dayIndex);

  const dayComplete = Boolean(dayDone && requiredTotal && dayDone >= requiredTotal);

  if (dayComplete) {
    const { data: already } = await auth.supabase
      .from('challenge_success_events')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .eq('event_type', 'day_complete')
      .eq('title', `יום ${dayIndex} הושלם!`)
      .limit(1)
      .maybeSingle();

    if (!already) {
      await auth.supabase.from('challenge_success_events').insert({
        enrollment_id: enrollment.id,
        user_id: auth.user.id,
        event_type: 'day_complete',
        title: `יום ${dayIndex} הושלם!`,
        description: 'סיימת את כל המשימות של היום — זו הצלחה אמיתית.',
        detected_by: 'rule',
        evidence: { day_index: dayIndex },
      });
    }
  }

  const slotViews = resolveTaskSlots(
    {
      task_key: taskDef.task_key as string,
      schedule_type: taskDef.schedule_type as 'per_meal',
    },
    scheduleProfile,
    new Set(),
  );
  const slotLabel = slotKey ? slotViews.find((s) => s.slot_key === slotKey)?.label : null;

  const celebration = getCelebrationForTask({
    taskKey: taskDef.task_key as string,
    celebrationKey: taskDef.celebration_key as string | null,
    slotLabel,
    dayComplete,
    dayIndex,
  });

  return NextResponse.json({ completion, celebration, day_complete: dayComplete });
}
