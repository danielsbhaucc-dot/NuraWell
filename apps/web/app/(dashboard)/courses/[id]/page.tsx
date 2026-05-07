import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { CourseDetailClient } from '../../../../components/course/CourseDetailClient';

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
  is_premium: boolean;
  lessons: RawLesson[];
}

interface RawEnrollment {
  id: string;
  is_active: boolean;
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
  if (!course) return { title: 'קורס לא נמצא' };
  return { title: course.title, description: course.description ?? undefined };
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawCourse } = await supabase
    .from('courses')
    .select('id, title, description, thumbnail_url, is_premium, lessons(id, title, description, lesson_type, sort_order, duration_minutes, is_published)')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  const course = rawCourse as RawCourse | null;
  if (!course) notFound();

  const { data: rawEnrollment } = await supabase
    .from('enrollments')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('course_id', id)
    .maybeSingle();

  const enrollment = rawEnrollment as RawEnrollment | null;
  const isEnrolled = !!(enrollment?.is_active);

  const { data: rawProgress } = isEnrolled
    ? await supabase
        .from('lesson_progress')
        .select('lesson_id, is_completed')
        .eq('user_id', user.id)
    : { data: [] as RawProgress[] };

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
  const firstIncompleteLesson = isEnrolled
    ? (publishedLessons.find(l => !l.is_completed) ?? publishedLessons[0])
    : null;

  return (
    <CourseDetailClient
      course={{ ...course, lessons: publishedLessons }}
      isEnrolled={isEnrolled}
      progress={progress}
      completedCount={completedCount}
      firstIncompleteLessonId={firstIncompleteLesson?.id ?? null}
    />
  );
}
