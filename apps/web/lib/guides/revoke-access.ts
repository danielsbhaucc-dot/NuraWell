import type { SupabaseClient } from '@supabase/supabase-js';

export interface RevokeGuideAccessParams {
  supabase: SupabaseClient;
  userId: string;
  courseId: string;
  reason: string;
}

export interface RevokeGuideAccessResult {
  revoked: boolean;
  message: string;
}

/** סוגר גישה למדריך (מבטל enrollment פעיל). */
export async function revokeGuideAccess(
  params: RevokeGuideAccessParams
): Promise<RevokeGuideAccessResult> {
  const { supabase, userId, courseId, reason } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id, is_active')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (!existing?.is_active) {
    return { revoked: false, message: 'אין גישה פעילה לסגור' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('enrollments')
    .update({
      is_active: false,
      granted_reason: reason,
    })
    .eq('id', existing.id);

  if (error) {
    return { revoked: false, message: error.message };
  }

  return { revoked: true, message: 'הגישה למדריך נסגרה' };
}
