import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatSessionKind, ChatSessionListItem } from './types';
import type { ChatSessionRow } from './types';

type PgError = { code?: string; message?: string } | null;
type QueryResult = { data: unknown; error: PgError };

export function isMissingColumnError(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist/i.test(error.message ?? '')
  );
}

export function isMissingRelationError(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '')
  );
}

export const CHAT_SESSION_LIST_SELECTS = [
  'id, status, session_kind, title, summary, preview_text, message_count, created_at, updated_at, closed_at',
  'id, status, session_kind, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, status, session_kind, summary, created_at, updated_at, closed_at',
  'id, status, summary, created_at, updated_at, closed_at',
] as const;

export const CHAT_SESSION_ROW_SELECTS = [
  'id, user_id, status, title, summary, live_conversation_file, preview_text, message_count, created_at, updated_at, closed_at',
  'id, user_id, status, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, user_id, status, summary, created_at, updated_at, closed_at',
] as const;

export const CHAT_SESSION_CLOSE_SELECTS = [
  'id, user_id, status, title, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, user_id, status, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, user_id, status, summary, created_at, updated_at, closed_at',
] as const;

export const CHAT_SESSION_DETAIL_SELECTS = [
  'id, status, session_kind, title, summary',
  'id, status, session_kind, summary',
  'id, status, summary',
] as const;

export async function queryWithColumnFallbacks<T>(
  selects: readonly string[],
  run: (select: string) => PromiseLike<QueryResult>
): Promise<{ data: T | null; error: PgError }> {
  let lastError: PgError = null;
  for (const select of selects) {
    const { data, error } = await run(select);
    if (!error) return { data: data as T, error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
}

export function normalizeChatSessionListItem(row: Record<string, unknown>): ChatSessionListItem {
  const kind = (row.session_kind as ChatSessionKind | null) ?? 'chat';
  return {
    id: row.id as string,
    status: row.status as 'open' | 'closed',
    session_kind: kind,
    title: (row.title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    closed_at: (row.closed_at as string | null) ?? null,
    preview_text: kind === 'profile_update' ? null : ((row.preview_text as string | null) ?? null),
    message_count: kind === 'profile_update' ? 0 : Number(row.message_count ?? 0),
  };
}

export function normalizeChatSessionRow(row: Record<string, unknown>): ChatSessionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    status: row.status as ChatSessionRow['status'],
    title: (row.title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    live_conversation_file: (row.live_conversation_file as string | null) ?? null,
    preview_text: (row.preview_text as string | null) ?? null,
    message_count: Number(row.message_count ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    closed_at: (row.closed_at as string | null) ?? null,
  };
}

export async function selectUserChatSessionList(
  supabase: SupabaseClient,
  userId: string,
  limit: number
) {
  return queryWithColumnFallbacks<Record<string, unknown>[]>(
    CHAT_SESSION_LIST_SELECTS,
    (select) =>
      supabase
        .from('chat_sessions')
        .select(select)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit)
  );
}

export async function selectChatSessionRow(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string },
  selects: readonly string[] = CHAT_SESSION_ROW_SELECTS
) {
  return queryWithColumnFallbacks<Record<string, unknown>>(
    selects,
    (select) =>
      supabase
        .from('chat_sessions')
        .select(select)
        .eq('id', params.sessionId)
        .eq('user_id', params.userId)
        .maybeSingle()
  );
}

export async function selectChatSessionDetail(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
) {
  return queryWithColumnFallbacks<Record<string, unknown>>(
    CHAT_SESSION_DETAIL_SELECTS,
    (select) =>
      supabase
        .from('chat_sessions')
        .select(select)
        .eq('id', params.sessionId)
        .eq('user_id', params.userId)
        .maybeSingle()
  );
}
