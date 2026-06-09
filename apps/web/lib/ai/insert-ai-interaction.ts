import type { ApiRouteSupabaseResult } from '../supabase/api-route-client';

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
};

export async function insertAiInteraction(
  supabase: ApiRouteSupabaseResult['supabase'],
  payload: AiInteractionInsert
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('ai_interactions').insert(payload);
  if (error) throw error;
}
