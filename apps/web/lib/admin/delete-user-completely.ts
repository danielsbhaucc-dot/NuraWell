import type { SupabaseClient } from '@supabase/supabase-js';

export type DeleteUserResult = { ok: true } | { ok: false; error: string };

/**
 * מוחק משתמש מ-auth.users — CASCADE מוחק profiles וכל הנתונים המקושרים ב-DB.
 * billing_events נשארים עם user_id=NULL (חובת שמירת רשומות חשבונאיות).
 */
export async function deleteUserCompletely(
  admin: SupabaseClient,
  userId: string
): Promise<DeleteUserResult> {
  // טבלאות בלי FK עם CASCADE: מוחקים ידנית כדי שלא יישאר מזהה משתמש
  for (const table of ['ai_usage_events', 'ai_usage_monthly', 'ai_interaction_edits', 'error_events']) {
    const { error: e } = await admin.from(table).delete().eq('user_id', userId);
    if (e) console.warn('[deleteUserCompletely] cleanup failed', table, e.message);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
