/**
 * אגירה פסיבית של צ'אטים — ללא LLM. נשמר ב-pending_chat_logs לעיבוד אצווה יומי.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const MIN_LOG_CHARS = 12;
const MAX_LOG_CHARS = 12_000;

export function formatChatTurnForPendingLog(params: {
  userMessage: string;
  assistantMessage: string;
  createdAt?: Date;
}): string {
  const user = params.userMessage.replace(/\s+/g, ' ').trim();
  const assistant = params.assistantMessage.replace(/\s+/g, ' ').trim();
  const ts = (params.createdAt ?? new Date()).toISOString();
  return `[${ts}]\nמשתמש: ${user}\nמנטור: ${assistant}`;
}

export async function enqueuePendingChatLog(params: {
  admin: SupabaseClient;
  userId: string;
  rawChatText: string;
  sessionId?: string | null;
}): Promise<{ enqueued: boolean }> {
  const text = params.rawChatText.trim().slice(0, MAX_LOG_CHARS);
  if (text.length < MIN_LOG_CHARS) return { enqueued: false };

  const { error } = await params.admin.from('pending_chat_logs').insert({
    user_id: params.userId,
    raw_chat_text: text,
    source_session_id: params.sessionId ?? null,
    processed: false,
  });

  if (error) {
    console.warn('[memory-consolidation] enqueue failed', {
      code: error.code,
      error: error.message,
    });
    return { enqueued: false };
  }

  return { enqueued: true };
}
