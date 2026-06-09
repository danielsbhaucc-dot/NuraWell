import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { CoursesClientWrapper } from '../../../components/course/CoursesClientWrapper';
import type { CourseWithProgress } from '../../../lib/types/course';
import { canAccessGuide, type GuideCourseRow, type GuideEnrollmentRow } from '../../../lib/guides/access';
import { computeGuideProgress } from '../../../lib/guides/progress';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המדריכים שלי',
  description: 'כל המדריכים שלך ב-NuraWell - התחל ללמוד ולהתקדם',
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  interface RawEnrollmentRow {
    course_id: string;
    is_active: boolean;
    access_type?: string | null;
    trial_ends_at?: string | null;
    course: RawCourseRow | RawCourseRow[] | null;
  }
  interface RawCourseRow {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    is_premium: boolean;
    is_published?: boolean | null;
    unlock_at?: string | null;
    visibility?: string | null;
    lessons: { id: string; title?: string; sort_order?: number }[];
  }
  interface RawProgressRow {
    lesson_id: string;
    is_completed: boolean;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawEnrollments } = await supabase
    .from('enrollments')
    .select('course_id, is_active, access_type, trial_ends_at, course:courses(id, title, description, thumbnail_url, is_premium, is_published, unlock_at, visibility, lessons(id, title, sort_order))')
    .eq('user_id', user.id)
    .eq('is_active', true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProgressRows } = await supabase
    .from('lesson_progress')
    .select('lesson_id, is_completed')
    .eq('user_id', user.id);

  const enrollments = (rawEnrollments as RawEnrollmentRow[]) || [];
  const progressRows = (rawProgressRows as RawProgressRow[]) || [];
  const completedLessonIds = new Set(
    progressRows.filter(p => p.is_completed).map(p => p.lesson_id)
  );

  const enrolledCourses: CourseWithProgress[] = enrollments
    .map(e => {
      const course = Array.isArray(e.course) ? e.course[0] : e.course;
      if (!course) return null;

      const courseRow = course as GuideCourseRow;
      const enrollment = e as GuideEnrollmentRow;
      if (!canAccessGuide(courseRow, enrollment)) return null;

      const lessons = course.lessons || [];
      const summary = computeGuideProgress(
        { id: course.id, title: course.title, description: course.description },
        lessons.map((l) => ({ id: l.id, title: l.title ?? '', sort_order: l.sort_order ?? 0 })),
        progressRows,
        e
      );

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnail_url: course.thumbnail_url,
        is_premium: course.is_premium,
        lessons,
        progress: summary.progressPct,
        isEnrolled: true,
        currentChapterTitle: summary.currentChapterTitle,
        completedChapters: summary.completedChapters,
        totalChapters: summary.totalChapters,
      } as CourseWithProgress;
    })
    .filter((c): c is CourseWithProgress => c !== null);

  const totalLessonsCompleted = completedLessonIds.size;
  const activeCoursesCount = enrolledCourses.length;
  const avgProgress = enrolledCourses.length
    ? Math.round(enrolledCourses.reduce((s, c) => s + c.progress, 0) / enrolledCourses.length)
    : 0;

  return (
    <CoursesClientWrapper
      enrolledCourses={enrolledCourses}
      availableCourses={[]}
      stats={{ totalLessonsCompleted, activeCoursesCount, avgProgress }}
    />
  );
}
