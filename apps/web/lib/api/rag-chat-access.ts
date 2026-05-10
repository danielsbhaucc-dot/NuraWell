import { escapeFilterString } from '@/lib/ai/system-knowledge-vector';

type StepRow = {
  id: string;
  course_id: string | null;
  is_published: boolean;
};

/**
 * קורסים שהמשתמש רשום אליהם (פעילים) — מקור אמת ל־RAG, לא מהקליינט.
 */
export async function fetchUserEnrolledCourseIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`enrollments: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ course_id?: string }>;
  return [...new Set(rows.map((r) => r.course_id).filter((id): id is string => Boolean(id)))];
}

/**
 * בדיקה: המשתמש רשאי לשאול על צעד ספציפי — צעד מפורסם + (רישום לקורס של הצעד או התקדמות בצעד).
 */
export async function assertUserCanAccessStepForRag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  stepId: string
): Promise<{ ok: true; step: StepRow } | { ok: false; status: number; message: string }> {
  const { data: step, error: stepErr } = await supabase
    .from('journey_steps')
    .select('id, course_id, is_published')
    .eq('id', stepId)
    .maybeSingle();

  if (stepErr) {
    return { ok: false, status: 500, message: 'שגיאת מסד נתונים' };
  }

  const row = step as StepRow | null;
  if (!row || !row.is_published) {
    return { ok: false, status: 404, message: 'הצעד לא נמצא או אינו זמין' };
  }

  if (row.course_id) {
    const { data: enr, error: enrErr } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', row.course_id)
      .eq('is_active', true)
      .maybeSingle();

    if (enrErr) {
      return { ok: false, status: 500, message: 'שגיאת מסד נתונים' };
    }
    if (!enr) {
      return { ok: false, status: 403, message: 'אין גישה לצעד זה (נדרש רישום לקורס)' };
    }
  } else {
    const { data: prog, error: progErr } = await supabase
      .from('journey_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('step_id', stepId)
      .maybeSingle();

    if (progErr) {
      return { ok: false, status: 500, message: 'שגיאת מסד נתונים' };
    }
    if (!prog) {
      return { ok: false, status: 403, message: 'אין גישה לצעד זה לפני תחילת המסע' };
    }
  }

  return { ok: true, step: row };
}

/**
 * מסנן Upstash לשליפת צ'אנקים לפי צעד (אחרי אימות גישה בצד שרת).
 */
export function buildStepRagFilter(stepId: string, enrolledCourseIds: string[]): string {
  const sid = escapeFilterString(stepId);
  const branches = [
    `accessLevel = 'public'`,
    `(accessLevel = 'premium' AND HAS NOT FIELD courseId)`,
  ];
  if (enrolledCourseIds.length > 0) {
    branches.push(
      `(accessLevel = 'premium' AND courseId IN (${enrolledCourseIds.map(escapeFilterString).join(', ')}))`
    );
  }
  return `dataType = 'step' AND stepId = ${sid} AND (${branches.join(' OR ')})`;
}
