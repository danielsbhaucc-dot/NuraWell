import type { SupabaseClient } from '@supabase/supabase-js';
import { generateMentorSystemPrompt, calculateDailyCheckInTimes } from '@/lib/ai/generate-mentor-system-prompt';
import { ingestOnboardingIntoVectorMemory } from '@/lib/ai/ingest-onboarding-vector-memory';
import type { OnboardingProfileForChat } from '@/lib/ai/onboarding-chat-context';
import { buildMealSchedule, type MealScheduleEntry } from '@/lib/onboarding/meal-schedule';
import type { MainGoal, MainObstacle, OnboardingGender, WeakestTimeOfDay } from '@/lib/onboarding/types';

export type AdminProfilePatch = {
  full_name?: string;
  gender?: OnboardingGender;
  main_goal?: MainGoal;
  current_weight_kg?: number;
  goal_weight_kg?: number;
  height_cm?: number | null;
  weakest_time_of_day?: WeakestTimeOfDay;
  main_obstacle?: MainObstacle;
  main_obstacle_detail?: string | null;
  wake_up_time?: string;
  sleep_time?: string;
  meal_count?: number;
  meal_schedule?: MealScheduleEntry[] | null;
};

export async function applyAdminProfilePatch(
  admin: SupabaseClient,
  userId: string,
  patch: AdminProfilePatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select(
      `full_name, gender, main_goal, current_weight_kg, goal_weight_kg, height_cm,
      weakest_time_of_day, main_obstacle, main_obstacle_detail,
      wake_up_time, sleep_time, dinner_time, meal_count, meal_schedule, preferred_channel`
    )
    .eq('id', userId)
    .maybeSingle();

  if (readErr || !existing) {
    return { ok: false, error: 'פרופיל לא נמצא' };
  }

  const merged = {
    full_name: patch.full_name ?? existing.full_name,
    gender: patch.gender ?? existing.gender,
    main_goal: patch.main_goal ?? existing.main_goal,
    current_weight_kg: patch.current_weight_kg ?? existing.current_weight_kg,
    goal_weight_kg: patch.goal_weight_kg ?? existing.goal_weight_kg,
    height_cm: patch.height_cm !== undefined ? patch.height_cm : existing.height_cm,
    weakest_time_of_day: patch.weakest_time_of_day ?? existing.weakest_time_of_day,
    main_obstacle: patch.main_obstacle ?? existing.main_obstacle,
    main_obstacle_detail:
      patch.main_obstacle_detail !== undefined ?
        patch.main_obstacle_detail
      : existing.main_obstacle_detail,
    wake_up_time: patch.wake_up_time ?? existing.wake_up_time,
    sleep_time: patch.sleep_time ?? existing.sleep_time,
    meal_count: patch.meal_count ?? existing.meal_count ?? 0,
    meal_schedule:
      patch.meal_schedule !== undefined ? patch.meal_schedule : (existing.meal_schedule as MealScheduleEntry[] | null),
    preferred_channel: existing.preferred_channel ?? 'in_app',
  };

  const mealSchedule = Array.isArray(merged.meal_schedule) ? merged.meal_schedule : [];
  const dinnerTime =
    mealSchedule.length === 0 && existing.dinner_time ? String(existing.dinner_time).slice(0, 5) : null;

  const checkInTimes = calculateDailyCheckInTimes(
    String(merged.wake_up_time).slice(0, 5),
    String(merged.sleep_time).slice(0, 5),
    merged.weakest_time_of_day,
    { dinnerTime, meals: mealSchedule.length ? mealSchedule : null }
  );

  const systemPrompt = generateMentorSystemPrompt({
    full_name: merged.full_name,
    gender: merged.gender,
    main_goal: merged.main_goal,
    current_weight_kg: merged.current_weight_kg,
    goal_weight_kg: merged.goal_weight_kg,
    height_cm: merged.height_cm,
    weakest_time_of_day: merged.weakest_time_of_day,
    main_obstacle: merged.main_obstacle,
    main_obstacle_detail: merged.main_obstacle_detail,
    wake_up_time: String(merged.wake_up_time).slice(0, 5),
    sleep_time: String(merged.sleep_time).slice(0, 5),
    dinner_time: dinnerTime,
    meal_schedule: mealSchedule.length ? mealSchedule : null,
    preferred_channel: merged.preferred_channel,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await admin
    .from('profiles')
    .update({
      full_name: merged.full_name,
      gender: merged.gender,
      main_goal: merged.main_goal,
      current_weight_kg: merged.current_weight_kg,
      goal_weight_kg: merged.goal_weight_kg,
      height_cm: merged.height_cm,
      weakest_time_of_day: merged.weakest_time_of_day,
      main_obstacle: merged.main_obstacle,
      main_obstacle_detail:
        merged.main_obstacle === 'other' ? merged.main_obstacle_detail?.trim() || null : null,
      wake_up_time: merged.wake_up_time,
      sleep_time: merged.sleep_time,
      meal_count: merged.meal_count,
      meal_schedule: mealSchedule.length ? mealSchedule : null,
      ai_check_in_times: checkInTimes,
      ai_system_prompt: systemPrompt,
    })
    .eq('id', userId);

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const vectorProfile: OnboardingProfileForChat = {
    full_name: merged.full_name,
    gender: merged.gender,
    main_goal: merged.main_goal,
    current_weight_kg: merged.current_weight_kg,
    goal_weight_kg: merged.goal_weight_kg,
    weakest_time_of_day: merged.weakest_time_of_day,
    main_obstacle: merged.main_obstacle,
    main_obstacle_detail:
      merged.main_obstacle === 'other' ? merged.main_obstacle_detail?.trim() || null : null,
    wake_up_time: String(merged.wake_up_time).slice(0, 5),
    sleep_time: String(merged.sleep_time).slice(0, 5),
    dinner_time: dinnerTime,
    meal_schedule: mealSchedule.length ? mealSchedule : null,
    preferred_channel: merged.preferred_channel,
    ai_check_in_times: checkInTimes,
    onboarding_completed: true,
  };

  ingestOnboardingIntoVectorMemory(userId, vectorProfile).catch(() => {});

  return { ok: true };
}
