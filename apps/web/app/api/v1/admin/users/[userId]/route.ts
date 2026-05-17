import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJsonBody } from '@/lib/api/json-request';
import { applyAdminProfilePatch } from '@/lib/admin/update-user-onboarding';
import { buildMealSchedule } from '@/lib/onboarding/meal-schedule';
import { GENDERS, MAIN_GOALS, MAIN_OBSTACLES, WEAKEST_TIMES } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { userId } = await context.params;
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error } = await (admin as any)
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: journeyRows } = await (admin as any)
    .from('journey_progress')
    .select('step_id, is_completed, tasks_completed, task_statuses, habits_progress, updated_at')
    .eq('user_id', userId);

  const journey = journeyRows ?? [];
  const completedSteps = journey.filter((j: { is_completed?: boolean }) => j.is_completed).length;

  let acceptedTasks = 0;
  let activeHabits = 0;
  for (const j of journey) {
    const ts = j.task_statuses as Record<string, { status?: string }> | null;
    if (ts) {
      acceptedTasks += Object.values(ts).filter((v) => v?.status === 'accepted').length;
    }
    const hp = j.habits_progress as Record<string, boolean[]> | null;
    if (hp) {
      activeHabits += Object.keys(hp).length;
    }
  }

  return NextResponse.json({
    profile,
    auth: {
      email: authUser?.user?.email ?? null,
      email_confirmed_at: authUser?.user?.email_confirmed_at ?? null,
      created_at: authUser?.user?.created_at ?? null,
    },
    stats: {
      journey_steps_tracked: journey.length,
      journey_steps_completed: completedSteps,
      tasks_accepted: acceptedTasks,
      habits_tracked: activeHabits,
    },
    journey,
  });
}

const patchSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  gender: z.enum(GENDERS).optional(),
  main_goal: z.enum(MAIN_GOALS).optional(),
  current_weight_kg: z.coerce.number().min(30).max(400).optional(),
  goal_weight_kg: z.coerce.number().min(30).max(400).optional(),
  height_cm: z.coerce.number().min(100).max(250).nullable().optional(),
  weakest_time_of_day: z.enum(WEAKEST_TIMES).optional(),
  main_obstacle: z.enum(MAIN_OBSTACLES).optional(),
  main_obstacle_detail: z.string().max(500).nullable().optional(),
  wake_up_time: z.string().optional(),
  sleep_time: z.string().optional(),
  meal_count: z.coerce.number().min(0).max(3).optional(),
  meal_schedule_json: z.string().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { userId } = await context.params;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים', details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = { ...parsed.data } as Record<string, unknown>;
  delete patch.meal_schedule_json;

  if (parsed.data.meal_schedule_json) {
    try {
      const times = JSON.parse(parsed.data.meal_schedule_json) as string[];
      if (Array.isArray(times)) {
        (patch as { meal_schedule?: unknown }).meal_schedule = buildMealSchedule(times);
      }
    } catch {
      return NextResponse.json({ error: 'meal_schedule_json לא תקין' }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const result = await applyAdminProfilePatch(admin, userId, patch);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
