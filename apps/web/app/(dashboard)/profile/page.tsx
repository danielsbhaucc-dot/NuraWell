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
    .select('id, full_name, role, avatar_url, created_at, streak_days, onboarding_completed, goal_weight_kg, current_weight_kg, height_cm, activity_level')
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
  } | null;

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
    />
  );
}
