import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { computeEatingWindow } from '@/lib/challenge/eating-window';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import {
  DEFAULT_EATING_WINDOW_LESSON,
  type ChallengeEatingWindowLesson,
} from '@/lib/challenge/content';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  eating_window: z
    .object({
      start: z.string(),
      end: z.string(),
      last_meal_recommended: z.string(),
      sleep_buffer_minutes: z.number(),
      first_meal: z.string(),
      last_meal: z.string(),
    })
    .optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('wake_up_time, sleep_time, meal_schedule')
    .eq('id', auth.user.id)
    .single();

  const computed = computeEatingWindow({
    wakeUpTime: profile?.wake_up_time as string | null,
    sleepTime: profile?.sleep_time as string | null,
    mealSchedule: profile?.meal_schedule as Array<{ time?: string | null }> | null,
  });

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('challenge_eating_window_lesson')
    .eq('id', 1)
    .maybeSingle();

  const lesson =
    (settings?.challenge_eating_window_lesson as ChallengeEatingWindowLesson | null) ??
    DEFAULT_EATING_WINDOW_LESSON;

  return NextResponse.json({
    suggested: computed.config,
    warnings: computed.warnings,
    suggestions: computed.suggestions,
    saved: enrollment.eating_window,
    lesson,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  let eatingWindow = parsed.data.eating_window;

  if (!eatingWindow) {
    const { data: profile } = await auth.supabase
      .from('profiles')
      .select('wake_up_time, sleep_time, meal_schedule')
      .eq('id', auth.user.id)
      .single();

    const computed = computeEatingWindow({
      wakeUpTime: profile?.wake_up_time as string | null,
      sleepTime: profile?.sleep_time as string | null,
      mealSchedule: profile?.meal_schedule as Array<{ time?: string | null }> | null,
    });
    eatingWindow = computed.config;
  }

  const { data, error } = await auth.supabase
    .from('challenge_enrollments')
    .update({
      eating_window: eatingWindow,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id)
    .eq('user_id', auth.user.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enrollment: data });
}
