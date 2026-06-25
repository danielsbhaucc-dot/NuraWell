import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { ProfilePageClient } from '../../../components/profile/ProfilePageClient';

export const metadata: Metadata = {
  title: 'הפרופיל שלי',
  description: 'נהל את הפרופיל האישי שלך ב-NuraWell',
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select(
      'id, full_name, role, avatar_url, created_at, streak_days, onboarding_completed, goal_weight_kg, current_weight_kg, height_cm, activity_level, gender, wake_up_time, sleep_time, meal_count, meal_schedule, main_goal, main_obstacle, main_obstacle_detail, weakest_time_of_day'
    )
    .eq('id', user.id)
    .single();

  const profile = rawProfile as {
    id: string;
    full_name: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
    streak_days: number | null;
    onboarding_completed: boolean | null;
    goal_weight_kg: number | null;
    current_weight_kg: number | null;
    height_cm: number | null;
    activity_level: string | null;
    gender: 'male' | 'female' | null;
    wake_up_time: string | null;
    sleep_time: string | null;
    meal_count: number | null;
    meal_schedule: Array<{ time?: string }> | null;
    main_goal: string | null;
    main_obstacle: string | null;
    main_obstacle_detail: string | null;
    weakest_time_of_day: string | null;
  } | null;

  const mealTimes = Array.isArray(profile?.meal_schedule)
    ? profile.meal_schedule.map((m) => String(m.time ?? '').slice(0, 5)).filter(Boolean)
    : [];

  const { data: rawStats } = await supabase
    .from('lesson_progress')
    .select('lesson_id, is_completed')
    .eq('user_id', user.id);

  const stats = rawStats as { lesson_id: string; is_completed: boolean }[] | null;
  const totalCompleted = (stats || []).filter(s => s.is_completed).length;

  const { data: rawEnrollments } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const enrolledCount = (rawEnrollments as { course_id: string }[] | null)?.length ?? 0;

  return (
    <ProfilePageClient
      profile={profile}
      email={user.email ?? ''}
      totalCompleted={totalCompleted}
      enrolledCount={enrolledCount}
      rhythm={{
        wake_up_time: profile?.wake_up_time ? String(profile.wake_up_time).slice(0, 5) : null,
        sleep_time: profile?.sleep_time ? String(profile.sleep_time).slice(0, 5) : null,
        meal_count: typeof profile?.meal_count === 'number' ? profile.meal_count : mealTimes.length,
        meal_times: mealTimes,
      }}
    />
  );
}
