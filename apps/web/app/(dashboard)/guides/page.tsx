import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { CoursesClientWrapper } from '../../../components/course/CoursesClientWrapper';
import type { CourseWithProgress } from '../../../lib/types/course';
import { canAccessGuide, type GuideCourseRow, type GuideEnrollmentRow } from '../../../lib/guides/access';
import { computeGuideProgress } from '../../../lib/guides/progress';
import type { GuideKnowledgeEntry } from '../../../components/course/GuidesAlmogKnowledgePanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המדריכים שלי',
  description: 'כל המדריכים שלך ב-NuraWell - התחל ללמוד ולהתקדם',
};

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name, gender, ai_context')
    .eq('id', user.id)
    .single();

  const profile = profileRow as {
    full_name: string | null;
    gender: 'male' | 'female' | null;
    ai_context: { guide_companion?: { almog_note?: string; next_pick?: { courseTitle?: string } } } | null;
  } | null;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'חבר';
  const gender = profile?.gender ?? null;
  const almogNote = profile?.ai_context?.guide_companion?.almog_note ?? null;
  const nextPickTitle = profile?.ai_context?.guide_companion?.next_pick?.courseTitle ?? null;

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

  const enrolledIds = enrolledCourses.map((c) => c.id);
  const ragByCourse = new Map<string, number>();
  if (enrolledIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: knowledgeRows } = await supabase
      .from('almog_knowledge')
      .select('course_id, chunk_count')
      .eq('data_type', 'course')
      .in('course_id', enrolledIds);
    for (const row of (knowledgeRows ?? []) as Array<{ course_id: string; chunk_count: number | null }>) {
      if (row.course_id) ragByCourse.set(row.course_id, row.chunk_count ?? 0);
    }
  }

  const knowledgeEntries: GuideKnowledgeEntry[] = enrolledCourses.map((c) => ({
    courseId: c.id,
    title: c.title,
    chapterCount: c.totalChapters ?? c.lessons?.length ?? 0,
    chunkCount: ragByCourse.get(c.id) ?? 0,
    indexed: ragByCourse.has(c.id),
  }));

  return (
    <CoursesClientWrapper
      enrolledCourses={enrolledCourses}
      availableCourses={[]}
      stats={{ totalLessonsCompleted, activeCoursesCount, avgProgress }}
      firstName={firstName}
      gender={gender}
      almogNote={almogNote}
      nextPickTitle={nextPickTitle}
      knowledgeEntries={knowledgeEntries}
    />
  );
}
