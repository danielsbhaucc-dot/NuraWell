import type { SupabaseClient } from '@supabase/supabase-js';
import { REPLY_QUOTE_MAX_BACK } from './index';

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
