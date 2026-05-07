import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { LessonPageClient } from '../../../../components/course/LessonPageClient';
import type { LessonDetail, MediaFile, LessonTask, LessonHabit, ExternalLink } from '../../../../lib/types/course';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RawMediaFile {
  id: string;
  lesson_id: string;
  file_type: string;
  uploadthing_url: string | null;
  uploadthing_name: string | null;
  uploadthing_size: number | null;
  video_provider: string | null;
  video_external_id: string | null;
  video_external_url: string | null;
  duration_seconds: number | null;
  mime_type: string | null;
  sort_order: number;
}

interface RawLesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  text_content: string | null;
  external_links: unknown;
  tasks: unknown;
  habits: unknown;
  sort_order: number;
  duration_minutes: number | null;
  media_files: RawMediaFile[];
  course: { id: string; title: string } | { id: string; title: string }[];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('lessons')
    .select('title, description, course:courses(title)')
    .eq('id', id)
    .single();
  const lesson = data as { title: string; description: string | null; course: { title: string } | { title: string }[] } | null;
  if (!lesson) return { title: 'שיעור לא נמצא' };
  const courseTitle = Array.isArray(lesson.course) ? lesson.course[0]?.title : lesson.course?.title;
  return {
    title: lesson.title,
    description: lesson.description ?? `שיעור מהקורס ${courseTitle ?? ''}`,
  };
}

export default async function LessonPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawLesson } = await supabase
    .from('lessons')
    .select(`
      id, course_id, title, description, lesson_type, text_content,
      external_links, tasks, habits, sort_order, duration_minutes,
      media_files(id, lesson_id, file_type, uploadthing_url, uploadthing_name, uploadthing_size,
        video_provider, video_external_id, video_external_url, duration_seconds, mime_type, sort_order),
      course:courses(id, title)
    `)
    .eq('id', id)
    .eq('is_published', true)
    .single();

  const lesson = rawLesson as RawLesson | null;
  if (!lesson) notFound();

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', lesson.course_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!enrollment) redirect(`/courses/${lesson.course_id}`);

  const { data: rawProgress } = await supabase
    .from('lesson_progress')
    .select('is_completed, task_progress, habit_progress, time_spent_seconds')
    .eq('user_id', user.id)
    .eq('lesson_id', id)
    .maybeSingle();

  const progress = rawProgress as {
    is_completed: boolean;
    task_progress: Record<string, boolean> | null;
    habit_progress: Record<string, boolean[]> | null;
    time_spent_seconds: number | null;
  } | null;

  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title, sort_order')
    .eq('course_id', lesson.course_id)
    .eq('is_published', true)
    .order('sort_order');

  const siblings = (allLessons as { id: string; title: string; sort_order: number }[] | null) || [];
  const currentIdx = siblings.findIndex(l => l.id === id);
  const prevLesson = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextLesson = currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  const courseRef = Array.isArray(lesson.course) ? lesson.course[0] : lesson.course;

  const lessonDetail: LessonDetail = {
    id: lesson.id,
    course_id: lesson.course_id,
    title: lesson.title,
    description: lesson.description,
    lesson_type: lesson.lesson_type as LessonDetail['lesson_type'],
    text_content: lesson.text_content,
    external_links: (lesson.external_links as ExternalLink[]) || [],
    tasks: (lesson.tasks as LessonTask[]) || [],
    habits: (lesson.habits as LessonHabit[]) || [],
    sort_order: lesson.sort_order,
    duration_minutes: lesson.duration_minutes,
    media_files: (lesson.media_files || []).map(m => ({
      ...m,
      file_type: m.file_type as MediaFile['file_type'],
      video_provider: m.video_provider as MediaFile['video_provider'],
    })).sort((a, b) => a.sort_order - b.sort_order),
    course: courseRef ?? { id: lesson.course_id, title: '' },
  };

  return (
    <LessonPageClient
      lesson={lessonDetail}
      initialProgress={{
        lesson_id: id,
        is_completed: progress?.is_completed ?? false,
        task_progress: progress?.task_progress ?? {},
        habit_progress: progress?.habit_progress ?? {},
        time_spent_seconds: progress?.time_spent_seconds ?? 0,
      }}
      prevLesson={prevLesson}
      nextLesson={nextLesson}
      userId={user.id}
    />
  );
}
