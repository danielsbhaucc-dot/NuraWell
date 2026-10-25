import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { HomeClient } from '../../../components/home/HomeClient';
import { PatternInsightsCard } from '../../../components/insights/PatternInsightsCard';
import {
  DynamicMentorWidget,
  loadMentorshipHomeContext,
} from '../../../components/mentorship/DynamicMentorWidget';
import { fetchSosContext } from '../../../lib/ai/guardian/sos-memory';
import { createAdminClient } from '../../../lib/supabase/admin';
import { firstNameFromFull } from '../../../lib/onboarding/profile-summary-rows';
import type { OnboardingGender } from '../../../lib/onboarding/types';
import {
  getCachedAuthUser,
  getCachedDashboardProfile,
} from '../../../lib/supabase/cached-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'בית',
  description: 'מסך הבית שלך ב-NuraWell — ברכה אישית, משימות והמשך המסע',
};

export default async function HomePage() {
  const { supabase, user } = await getCachedAuthUser();

  if (!user) redirect('/login');

  interface RawEnrollmentRow {
    course_id: string;
    course: { lessons: { id: string }[] } | { lessons: { id: string }[] }[] | null;
  }
  interface RawProgressRow {
    lesson_id: string;
    is_completed: boolean;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [
    { data: rawEnrollments },
    { data: rawProgressRows },
    profileRow,
    mentorship,
    sosContext,
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('course_id, course:courses(lessons(id))')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('lesson_progress').select('lesson_id, is_completed').eq('user_id', user.id),
    getCachedDashboardProfile(user.id),
    loadMentorshipHomeContext(supabase, user.id),
    // was a client fetch after idle (up to ~3s + round-trip) — now parallel with the page queries
    fetchSosContext(createAdminClient(), user.id).catch(() => null),
  ]);

  const enrollments = (rawEnrollments as RawEnrollmentRow[]) || [];
  const progressRows = (rawProgressRows as RawProgressRow[]) || [];
  const completedLessonIds = new Set(
    progressRows.filter((p) => p.is_completed).map((p) => p.lesson_id)
  );

  let activeCoursesCount = 0;
  let progressSum = 0;
  for (const e of enrollments) {
    const course = Array.isArray(e.course) ? e.course[0] : e.course;
    if (!course) continue;
    activeCoursesCount++;
    const lessons = course.lessons || [];
    const total = lessons.length || 1;
    const done = lessons.filter((l) => completedLessonIds.has(l.id)).length;
    progressSum += Math.round((done / total) * 100);
  }

  const profile = profileRow as { full_name: string | null; gender?: string | null } | null;
  const profileFullName = profile?.full_name?.trim();
  const gender = (profile?.gender as OnboardingGender | null) ?? '';
  // name comes only from the encrypted profile; auth user_metadata is never read for it
  const fullName =
    (profileFullName && profileFullName.length > 0 ? profileFullName : null) ??
    user.email?.split('@')[0] ??
    'משתמש';
  const firstName = firstNameFromFull(fullName) || 'משתמש';
  const { strategy: mentorshipStrategy, simplifiedDashboard } = mentorship;

  return (
    <HomeClient
      firstName={firstName}
      gender={gender}
      stats={{
        activeCoursesCount,
        avgProgress: activeCoursesCount ? Math.round(progressSum / activeCoursesCount) : 0,
        totalLessonsCompleted: completedLessonIds.size,
      }}
      simplifiedDashboard={simplifiedDashboard}
      sosInitial={sosContext}
      mentorWidget={
        <>
          <DynamicMentorWidget userId={user.id} firstName={firstName} strategy={mentorshipStrategy} />
          {simplifiedDashboard ? null : <PatternInsightsCard userId={user.id} max={1} compact />}
        </>
      }
    />
  );
}
