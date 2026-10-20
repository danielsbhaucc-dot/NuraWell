import type { SupabaseClient } from '@supabase/supabase-js';
import { REPLY_QUOTE_MAX_BACK } from './index';
import { decryptChatContent } from '@/lib/crypto/pii-fields';

/**
 * Server-side authz: maps the validated local index n to the id of the n-th latest USER message
 * of THIS user in THIS session. Never trusts an id from the model or the client.
 */
export async function resolveReplyQuoteMessageId(
  supabase: SupabaseClient,
  p: { userId: string; sessionId: string; n: number }
): Promise<string | null> {
  if (!Number.isInteger(p.n) || p.n < 1 || p.n > REPLY_QUOTE_MAX_BACK) return null;
  const { data, error } = await supabase
    .from('ai_interactions')
    .select('id')
    .eq('user_id', p.userId)
    .eq('session_id', p.sessionId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(REPLY_QUOTE_MAX_BACK);
  if (error || !data) return null;
  const row = data[p.n - 1] as { id?: string } | undefined;
  return typeof row?.id === 'string' ? row.id : null;
}

/**
 * User-side quote: validates that a client-sent id is an ASSISTANT message of THIS user in THIS
 * session. Returns its (decrypted) content for the writer note, or null when invalid.
 */
export async function validateUserQuotedAssistantMessage(
  supabase: SupabaseClient,
  p: { userId: string; sessionId: string; messageId: string }
): Promise<{ id: string; content: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(p.messageId)) return null;
  const { data, error } = await supabase
    .from('ai_interactions')
    .select('id, content')
    .eq('id', p.messageId)
    .eq('user_id', p.userId)
    .eq('session_id', p.sessionId)
    .eq('role', 'assistant')
    .maybeSingle();
  if (error || !data) return null;
  return { id: String((data as { id: string }).id), content: decryptChatContent((data as { content?: unknown }).content, p.userId) };
}

/** Maps a "k-th latest assistant bubble" index (live bubbles without a db id yet) to its id. */
export async function resolveAssistantBackIndex(
  supabase: SupabaseClient,
  p: { userId: string; sessionId: string; k: number }
): Promise<string | null> {
  if (!Number.isInteger(p.k) || p.k < 1 || p.k > 20) return null;
  const { data, error } = await supabase
    .from('ai_interactions')
    .select('id')
    .eq('user_id', p.userId)
    .eq('session_id', p.sessionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(p.k);
  if (error || !data) return null;
  const row = data[p.k - 1] as { id?: string } | undefined;
  return typeof row?.id === 'string' ? row.id : null;
}
