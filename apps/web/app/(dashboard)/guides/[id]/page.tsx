import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { CourseDetailClient } from '../../../../components/course/CourseDetailClient';
import { canAccessGuide, type GuideCourseRow, type GuideEnrollmentRow } from '../../../../lib/guides/access';
import { resolveGuideBackgroundUrl } from '../../../../lib/guides/resolve-background';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RawLesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
  sort_order: number;
  duration_minutes: number | null;
  is_published: boolean | null;
}

interface RawCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  background_image_key: string | null;
  is_premium: boolean;
  is_published: boolean | null;
  unlock_at: string | null;
  visibility: string | null;
  lessons: RawLesson[];
}

interface RawEnrollment {
  id: string;
  is_active: boolean;
  access_type?: string | null;
  trial_ends_at?: string | null;
}

interface RawProgress {
  lesson_id: string;
  is_completed: boolean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('courses')
    .select('title, description')
    .eq('id', id)
    .single();
  const course = data as { title: string; description: string | null } | null;
  if (!course) return { title: 'מדריך לא נמצא' };
  return { title: course.title, description: course.description ?? undefined };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawCourse } = await supabase
    .from('courses')
    .select('id, title, description, thumbnail_url, background_image_key, is_premium, is_published, unlock_at, visibility, lessons(id, title, description, lesson_type, sort_order, duration_minutes, is_published)')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  const course = rawCourse as RawCourse | null;
  if (!course) notFound();

  const { data: rawEnrollment } = await supabase
    .from('enrollments')
    .select('id, is_active, access_type, trial_ends_at')
    .eq('user_id', user.id)
    .eq('course_id', id)
    .maybeSingle();

  const enrollment = rawEnrollment as RawEnrollment | null;
  const courseRow = course as GuideCourseRow;
  const enrollmentRow = enrollment as GuideEnrollmentRow | null;
  const isEnrolled = canAccessGuide(courseRow, enrollmentRow);

  if (!isEnrolled) notFound();

  const { data: rawProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, is_completed')
    .eq('user_id', user.id);

  const completedLessonIds = new Set(
    ((rawProgress as RawProgress[]) || [])
      .filter(p => p.is_completed)
      .map(p => p.lesson_id)
  );

  const publishedLessons = (course.lessons || [])
    .filter(l => l.is_published !== false)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(l => ({ ...l, is_completed: completedLessonIds.has(l.id) }));

  const totalLessons = publishedLessons.length;
  const completedCount = publishedLessons.filter(l => l.is_completed).length;
  const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const firstIncompleteLesson = publishedLessons.find(l => !l.is_completed) ?? publishedLessons[0] ?? null;

  const background_image_url = resolveGuideBackgroundUrl(course.background_image_key);

  return (
    <CourseDetailClient
      course={{ ...course, lessons: publishedLessons, background_image_url }}
      isEnrolled={isEnrolled}
      progress={progress}
      completedCount={completedCount}
      firstIncompleteLessonId={firstIncompleteLesson?.id ?? null}
    />
  );
}
