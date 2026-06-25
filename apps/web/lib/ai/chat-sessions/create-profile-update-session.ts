import type { SupabaseClient } from '@supabase/supabase-js';

/** יוצר שיחה סגורה לתיעוד עדכון פרופיל — ללא transcript, ללא פתיחה מחדש */
export async function createProfileUpdateSession(
  supabase: SupabaseClient,
  params: { userId: string; summary: string }
): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: params.userId,
      status: 'closed',
      session_kind: 'profile_update',
      summary: params.summary,
      closed_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id as string };
}
