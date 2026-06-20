import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteAllUserMemoryVectors } from '@/lib/ai/upstash-vector-rest';
import { deleteUserCompletely } from '@/lib/admin/delete-user-completely';

export type DeleteAccountResult =
  | { ok: true; vectorsRemoved: number }
  | { ok: false; error: string };

/**
 * מחיקת חשבון מלאה: וקטורי זיכרון חיצוניים + auth.users (CASCADE ב-DB).
 */
export async function deleteUserAccountCompletely(
  admin: SupabaseClient,
  userId: string
): Promise<DeleteAccountResult> {
  let vectorsRemoved = 0;
  try {
    vectorsRemoved = await deleteAllUserMemoryVectors(userId);
  } catch (err) {
    console.warn('[deleteUserAccountCompletely] vector purge failed', err);
  }

  const result = await deleteUserCompletely(admin, userId);
  if (!result.ok) return result;

  return { ok: true, vectorsRemoved };
}
