import type { ApiRouteSupabaseResult } from '../supabase/api-route-client';
import { encryptChatContent } from '@/lib/crypto/pii-fields';

export type AiInteractionInsert = {
  user_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_type?: 'general' | 'lesson' | 'progress' | 'nutrition' | 'exercise' | 'motivation';
  context_id?: string;
  model_name?: string;
  tokens_used?: number;
  metadata?: Record<string, unknown>;
  /** WhatsApp-style quote: id of an earlier USER message in the same session (server-validated). */
  reply_to_message_id?: string;
};

export { restorePiiPlaceholders } from '@/lib/crypto/pii-placeholders';
import { firstNameFromFullName, restorePiiPlaceholders } from '@/lib/crypto/pii-placeholders';

export async function insertAiInteraction(
  supabase: ApiRouteSupabaseResult['supabase'],
  payload: AiInteractionInsert
): Promise<void> {
  let content = payload.content;
  if (payload.role === 'assistant' && content.includes('[')) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', payload.user_id).maybeSingle();
    const first = firstNameFromFullName((data as { full_name?: string | null } | null)?.full_name);
    content = restorePiiPlaceholders(content, first);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('ai_interactions')
    .insert({ ...payload, content: encryptChatContent(content, payload.user_id) });
  if (error) throw error;
}
