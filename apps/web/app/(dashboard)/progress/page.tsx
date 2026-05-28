import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { ProgressPageClient } from '../../../components/course/ProgressPageClient';
import { jerusalemDateKey } from '../../../lib/journey/task-schedule';

export const metadata: Metadata = {
  title: 'ההתקדמות שלי',
  description: 'מעקב אחרי ההתקדמות שלך ב-NuraWell - סטטיסטיקות, הישגים ומגמות',
};

interface RawProgressRow {
  lesson_id: string;
  is_completed: boolean;
  time_spent_seconds: number | null;
  updated_at: string;
  lesson: {
    id: string;
    title: string;
    lesson_type: string;
    course_id: string;
    course: { id: string; title: string; thumbnail_url: string | null } | { id: string; title: string; thumbnail_url: string | null }[];
  } | null;
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawProgress } = await supabase
    .from('lesson_progress')
    .select(`
      lesson_id, is_completed, time_spent_seconds, updated_at,
      lesson:lessons(id, title, lesson_type, course_id, course:courses(id, title, thumbnail_url))
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const { data: rawEnrollments } = await supabase
    .from('enrollments')
    .select('course_id, enrolled_at, course:courses(id, title, thumbnail_url, lessons(id))')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const progressRows = (rawProgress as RawProgressRow[] | null) || [];
  const enrollments = rawEnrollments as {
    course_id: string;
    enrolled_at: string;
    course: { id: string; title: string; thumbnail_url: string | null; lessons: { id: string }[] } | null;
  }[] | null || [];

  const completedRows = progressRows.filter(p => p.is_completed);
  const totalCompleted = completedRows.length;
  const totalTimeSeconds = progressRows.reduce((s, p) => s + (p.time_spent_seconds || 0), 0);

  const courseProgressMap = new Map<string, { title: string; thumbnail: string | null; total: number; completed: number }>();
  for (const e of enrollments) {
    if (!e.course) continue;
    const course = Array.isArray(e.course) ? e.course[0] : e.course;
    if (!course) continue;
    const lessonsCount = course.lessons?.length || 0;
    courseProgressMap.set(course.id, {
      title: course.title,
      thumbnail: course.thumbnail_url,
      total: lessonsCount,
      completed: 0,
    });
  }

  for (const p of completedRows) {
    if (!p.lesson) continue;
    const lesson = Array.isArray(p.lesson) ? p.lesson[0] : p.lesson;
    if (!lesson) continue;
    const entry = courseProgressMap.get(lesson.course_id);
    if (entry) entry.completed += 1;
  }

  const courseStats = Array.from(courseProgressMap.entries()).map(([id, data]) => ({
    id,
    ...data,
    progress: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
  }));

  const recentActivity = completedRows.slice(0, 10).map(p => {
    const lesson = Array.isArray(p.lesson) ? p.lesson[0] : p.lesson;
    return {
      lesson_id: p.lesson_id,
      lesson_title: lesson?.title ?? 'שיעור',
      lesson_type: lesson?.lesson_type ?? 'text',
      completed_at: p.updated_at,
    };
  });

  const today = new Date();
  const streakDays: boolean[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    return completedRows.some(p => p.updated_at.startsWith(dateStr));
  });
  const currentStreak = streakDays.findIndex(d => !d);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawJourneySteps } = await (supabase as any)
    .from('journey_steps')
    .select('id, step_number, title, tasks, habits')
    .eq('is_published', true)
    .order('step_number');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawJourneyProg } = await (supabase as any)
    .from('journey_progress')
    .select('step_id, is_completed, task_statuses, habits_progress, updated_at')
    .eq('user_id', user.id);

  const jSteps = (rawJourneySteps ?? []) as { id: string; step_number: number; title: string; tasks: unknown; habits: unknown }[];
  const jProg = (rawJourneyProg ?? []) as {
    step_id: string;
    is_completed: boolean | null;
    task_statuses: Record<string, { status?: string; execution_done?: boolean }> | null;
    habits_progress: Record<string, boolean[]> | null;
    updated_at: string;
  }[];

  const journeyStepsTotal = jSteps.length;
  const journeyStepsCompleted = jProg.filter(p => p.is_completed).length;
  let journeyTasksAccepted = 0;
  let journeyTasksReportedDone = 0;
  let journeyHabitChecks = 0;
  for (const p of jProg) {
    const ts = p.task_statuses ?? {};
    for (const row of Object.values(ts)) {
      if (row?.status === 'accepted') {
        journeyTasksAccepted++;
        if (row.execution_done === true) journeyTasksReportedDone++;
      }
    }
    const hp = p.habits_progress ?? {};
    for (const arr of Object.values(hp)) {
      if (Array.isArray(arr) && arr.some(Boolean)) journeyHabitChecks++;
    }
  }

  /**
   * היסטוריית מעקב יומי — 30 ימים אחורה בלוח ירושלים.
   * c = מספר ביצועי משימות באותו יום; t = 1 (סף "פעיל היום").
   * המקור: journey_task_executions — הטבלה הייעודית של NuraWell-1 (לא JSONB ישן).
   */
  const taskHistoryDays: { d: string; c: number; t: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    taskHistoryDays.push({ d: jerusalemDateKey(d), c: 0, t: 1 });
  }
  const sinceKey = taskHistoryDays[0]?.d ?? jerusalemDateKey(today);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawExecutions } = await (supabase as any)
    .from('journey_task_executions')
    .select('date_key')
    .eq('user_id', user.id)
    .gte('date_key', sinceKey)
    .limit(2000);

  if (Array.isArray(rawExecutions) && rawExecutions.length > 0) {
    const dayCount = new Map<string, number>();
    for (const row of rawExecutions as Array<{ date_key?: string }>) {
      const key = typeof row.date_key === 'string' ? row.date_key : '';
      if (!key) continue;
      dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
    }
    for (const day of taskHistoryDays) {
      day.c = dayCount.get(day.d) ?? 0;
    }
  }

  return (
    <ProgressPageClient
      totalCompleted={totalCompleted}
      totalEnrolled={enrollments.length}
      totalTimeMinutes={Math.round(totalTimeSeconds / 60)}
      currentStreak={currentStreak === -1 ? 7 : currentStreak}
      courseStats={courseStats}
      recentActivity={recentActivity}
      journeyStepsTotal={journeyStepsTotal}
      journeyStepsCompleted={journeyStepsCompleted}
      journeyTasksAccepted={journeyTasksAccepted}
      journeyTasksReportedDone={journeyTasksReportedDone}
      journeyHabitChecks={journeyHabitChecks}
      taskHistoryDays={taskHistoryDays}
    />
  );
}
