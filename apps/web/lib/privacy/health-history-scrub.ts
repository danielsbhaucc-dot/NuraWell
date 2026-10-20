/**
 * On health-consent withdrawal: replaces past health-related chat messages and session
 * titles/summaries/previews with the deleted placeholder. Classification is local only
 * (health-text lexicon, decrypted in-process); nothing is sent to any AI provider or logged.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptChatContent, encryptChatContent } from '@/lib/crypto/pii-fields';
import { isHealthChatMessage, isRedactedContent, REDACTED_CONTENT, REDACTED_PLACEHOLDER } from './health-chat-redaction';

export type HistoryScrubResult = { messages: number; sessions: number };

export async function scrubHealthFromChatHistory(admin: SupabaseClient, userId: string): Promise<HistoryScrubResult> {
  let messages = 0;
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin.from('ai_interactions').select('id, role, content').eq('user_id', userId).order('created_at').range(from, from + 499);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; role: string; content: string | null }>;
    for (const r of rows) {
      const text = decryptChatContent(r.content, userId);
      if (!text || isRedactedContent(text) || !isHealthChatMessage(text)) continue;
      const replacement = r.role === 'user' ? REDACTED_CONTENT : REDACTED_PLACEHOLDER;
      const { error: uErr } = await admin.from('ai_interactions').update({ content: encryptChatContent(replacement, userId) }).eq('id', r.id).eq('user_id', userId);
      if (uErr) throw new Error(uErr.message);
      messages++;
    }
    if (rows.length < 500) break;
  }
  // reply-QC audit copies (original/edited Almog text) must not outlive the scrub
  const { data: edits } = await admin.from('ai_interaction_edits').select('id, original_content, edited_content').eq('user_id', userId);
  for (const e of (edits ?? []) as Array<{ id: number; original_content: string; edited_content: string }>) {
    if (isHealthChatMessage(decryptChatContent(e.original_content, userId)) || isHealthChatMessage(decryptChatContent(e.edited_content, userId))) {
      await admin.from('ai_interaction_edits').delete().eq('id', e.id).eq('user_id', userId);
    }
  }
  let sessions = 0;
  const { data: sess, error: sErr } = await admin.from('chat_sessions').select('id, title, summary, preview_text').eq('user_id', userId);
  if (sErr) throw new Error(sErr.message);
  for (const s of (sess ?? []) as Array<{ id: string; title: string | null; summary: string | null; preview_text: string | null }>) {
    const patch: Record<string, string | null> = {};
    if (s.title && isHealthChatMessage(decryptChatContent(s.title, userId))) patch.title = encryptChatContent('שיחה', userId);
    if (s.summary && isHealthChatMessage(decryptChatContent(s.summary, userId))) patch.summary = null;
    if (s.preview_text && isHealthChatMessage(decryptChatContent(s.preview_text, userId))) patch.preview_text = encryptChatContent(REDACTED_PLACEHOLDER, userId);
    if (!Object.keys(patch).length) continue;
    const { error: uErr } = await admin.from('chat_sessions').update(patch).eq('id', s.id).eq('user_id', userId);
    if (uErr) throw new Error(uErr.message);
    sessions++;
  }
  return { messages, sessions };
}
