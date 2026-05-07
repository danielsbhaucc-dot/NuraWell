import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { CoursesClientWrapper } from '../../../components/course/CoursesClientWrapper';
import type { CourseWithProgress } from '../../../lib/types/course';
// Note: Supabase client returns 'never' types without generated DB types.
// Using (supabase as any) with explicit interfaces is intentional until DB types are generated.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הקורסים שלי',
  description: 'כל הקורסים שלך ב-NuraWell - התחל ללמוד ולהתקדם',
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  interface RawEnrollmentRow {
    course_id: string;
    course: RawCourseRow | RawCourseRow[] | null;
  }
  interface RawCourseRow {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    is_premium: boolean;
    lessons: { id: string }[];
  }
  interface RawProgressRow {
    lesson_id: string;
    is_completed: boolean;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawEnrollments } = await (supabase as any)
    .from('enrollments')
    .select('course_id, course:courses(id, title, description, thumbnail_url, is_premium, lessons(id))')
    .eq('user_id', user.id)
    .eq('is_active', true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawAllCourses } = await (supabase as any)
    .from('courses')
    .select('id, title, description, thumbnail_url, is_premium, lessons(id)')
    .eq('is_published', true)
    .order('sort_order');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProgressRows } = await (supabase as any)
    .from('lesson_progress')
    .select('lesson_id, is_completed')
    .eq('user_id', user.id);

  const enrollments = (rawEnrollments as RawEnrollmentRow[]) || [];
  const allCourses = (rawAllCourses as RawCourseRow[]) || [];
  const progressRows = (rawProgressRows as RawProgressRow[]) || [];
  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));
  const completedLessonIds = new Set(
    progressRows.filter(p => p.is_completed).map(p => p.lesson_id)
  );


  const enrolledCourses: CourseWithProgress[] = enrollments
    .map(e => {
      const course = Array.isArray(e.course) ? e.course[0] : e.course;
      if (!course) return null;
      const lessons = course.lessons || [];
      const total = lessons.length || 1;
      const done = lessons.filter(l => completedLessonIds.has(l.id)).length;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnail_url: course.thumbnail_url,
        is_premium: course.is_premium,
        lessons,
        progress: Math.round((done / total) * 100),
        isEnrolled: true,
      } as CourseWithProgress;
    })
    .filter((c): c is CourseWithProgress => c !== null);

  const availableCourses: CourseWithProgress[] = allCourses
    .filter(c => !enrolledCourseIds.has(c.id))
    .map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      thumbnail_url: c.thumbnail_url,
      is_premium: c.is_premium,
      lessons: c.lessons || [],
      progress: 0,
      isEnrolled: false,
    }));

  const totalLessonsCompleted = completedLessonIds.size;
  const activeCoursesCount = enrolledCourses.length;
  const avgProgress = enrolledCourses.length
    ? Math.round(enrolledCourses.reduce((s, c) => s + c.progress, 0) / enrolledCourses.length)
    : 0;

  return (
    <CoursesClientWrapper
      enrolledCourses={enrolledCourses}
      availableCourses={availableCourses}
      stats={{ totalLessonsCompleted, activeCoursesCount, avgProgress }}
    />
  );
}
