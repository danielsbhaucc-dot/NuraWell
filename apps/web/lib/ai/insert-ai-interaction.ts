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
};

/**
 * מקביל ל-restore_pii_placeholders ב-DB (הטריגר לא יכול לעבוד על ciphertext).
 * שם פרטי חוזר במקום placeholders של שם; פרטי קשר וכל טוקן אחר נמחקים.
 */
export function restorePiiPlaceholders(text: string, firstName: string | null): string {
  if (!text || !text.includes('[')) return text;
  let out = text.replace(
    /\[\[?\s*(PERSON_NAME|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|FIRSTNAME|NAME|USER|שם)\s*\]\]?/gi,
    firstName ?? ''
  );
  out = out.replace(/\[\[?\s*(ADDRESS|USER_ADDRESS|USER_PHONE|PHONE|USER_EMAIL|EMAIL|USER_ID|כתובת)\s*\]\]?/gi, '');
  out = out.replace(/\[\[\s*[A-Z][A-Z0-9_]*\s*\]\]/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/ +([.,!?;:])/g, '$1');
  return out;
}

export async function insertAiInteraction(
  supabase: ApiRouteSupabaseResult['supabase'],
  payload: AiInteractionInsert
): Promise<void> {
  let content = payload.content;
  if (payload.role === 'assistant' && content.includes('[')) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', payload.user_id).maybeSingle();
    const first = String((data as { full_name?: string | null } | null)?.full_name ?? '').trim().split(/\s+/)[0] || null;
    content = restorePiiPlaceholders(content, first);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('ai_interactions')
    .insert({ ...payload, content: encryptChatContent(content, payload.user_id) });
  if (error) throw error;
}
