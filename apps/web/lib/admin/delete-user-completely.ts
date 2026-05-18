import type { SupabaseClient } from '@supabase/supabase-js';

export type DeleteUserResult = { ok: true } | { ok: false; error: string };

/**
 * מוחק משתמש מ-auth.users — CASCADE מוחק profiles וכל הנתונים המקושרים ב-DB.
 */
export async function deleteUserCompletely(
  admin: SupabaseClient,
  userId: string
): Promise<DeleteUserResult> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
