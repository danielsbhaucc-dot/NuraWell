import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { HomeClient } from '../../../components/home/HomeClient';
import { firstNameFromFull } from '../../../lib/onboarding/profile-summary-rows';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'בית',
  description: 'מסך הבית שלך ב-NuraWell — ברכה אישית, משימות והמשך המסע',
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const [{ data: rawEnrollments }, { data: rawProgressRows }, { data: profileRow }] = await Promise.all([
    supabase
      .from('enrollments')
      .select('course_id, course:courses(lessons(id))')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('lesson_progress').select('lesson_id, is_completed').eq('user_id', user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
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

  const profile = profileRow as { full_name: string | null } | null;
  const profileFullName = profile?.full_name?.trim();
  const metaFullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  const fullName =
    (profileFullName && profileFullName.length > 0 ? profileFullName : null) ??
    (metaFullName.length > 0 ? metaFullName : null) ??
    user.email?.split('@')[0] ??
    'משתמש';
  const firstName = firstNameFromFull(fullName) || 'משתמש';

  return (
    <HomeClient
      firstName={firstName}
      guardianSosEnabled={process.env.GUARDIAN_SOS_ENABLED === '1'}
      stats={{
        activeCoursesCount,
        avgProgress: activeCoursesCount ? Math.round(progressSum / activeCoursesCount) : 0,
        totalLessonsCompleted: completedLessonIds.size,
      }}
    />
  );
}
