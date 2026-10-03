/**
 * React cache — איחוד getUser/profile בתוך אותו request (layout + page).
 */

import { cache } from 'react';
import { createClient } from './server';

export const getCachedAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export const getCachedDashboardProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `full_name, gender, main_goal, current_weight_kg, goal_weight_kg,
      weakest_time_of_day, main_obstacle, main_obstacle_detail,
      wake_up_time, sleep_time, meal_count, meal_schedule, dolev_welcome_seen_at, almog_welcome_seen_at,
      onboarding_completed`
    )
    .eq('id', userId)
    .maybeSingle();
  return profile;
});
