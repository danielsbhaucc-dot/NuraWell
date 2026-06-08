import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessGuide, type GuideCourseRow, type GuideEnrollmentRow } from './access';
import { computeGuideProgress, type GuideProgressSummary } from './progress';

/** שולף מדריכים פעילים + התקדמות למשתמש (לפרומפט אלמוג). */
export async function fetchUserGuideSummaries(
  supabase: SupabaseClient,
  userId: string
): Promise<GuideProgressSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enrollments } = await (supabase as any)
    .from('enrollments')
    .select(
      'course_id, is_active, access_type, trial_ends_at, course:courses(id, title, description, is_published, unlock_at, lessons(id, title, sort_order, duration_minutes))'
    )
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!enrollments?.length) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows } = await (supabase as any)
    .from('lesson_progress')
    .select('lesson_id, is_completed, completed_at')
    .eq('user_id', userId);

  const summaries: GuideProgressSummary[] = [];

  for (const enr of enrollments) {
    const course = Array.isArray(enr.course) ? enr.course[0] : enr.course;
    if (!course) continue;

    const courseRow: GuideCourseRow = course;
    const enrollment: GuideEnrollmentRow = enr;
    if (!canAccessGuide(courseRow, enrollment)) continue;

    const lessons = (course.lessons ?? []).map(
      (l: { id: string; title: string; sort_order: number; duration_minutes?: number | null }) => ({
        id: l.id,
        title: l.title,
        sort_order: l.sort_order,
        duration_minutes: l.duration_minutes,
      })
    );

    summaries.push(
      computeGuideProgress(
        { id: course.id, title: course.title, description: course.description },
        lessons,
        progressRows ?? [],
        enr
      )
    );
  }

  return summaries;
}
