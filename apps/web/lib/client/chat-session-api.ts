export type ChatSessionListItemClient = {
  id: string;
  status: 'open' | 'closed';
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  preview_text: string | null;
  message_count: number;
};

export type ChatSessionClientState = {
  id: string;
  status: 'open' | 'closed';
  summary: string | null;
};

export async function autoCloseStaleChatSessionsApi(): Promise<{ closedSessionIds: string[] }> {
  const res = await fetch('/api/v1/ai/chat-sessions/auto-close-stale', { method: 'POST' });
  if (!res.ok) throw new Error('auto_close_stale_failed');
  const data = (await res.json()) as { closedSessionIds?: string[] };
  return { closedSessionIds: data.closedSessionIds ?? [] };
}

export async function fetchChatSessionsList(): Promise<ChatSessionListItemClient[]> {
  const res = await fetch('/api/v1/ai/chat-sessions', { method: 'GET' });
  if (!res.ok) throw new Error('list_sessions_failed');
  const data = (await res.json()) as { sessions?: ChatSessionListItemClient[] };
  return data.sessions ?? [];
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionClientState | null> {
  const res = await fetch(`/api/v1/ai/chat-sessions/${sessionId}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('fetch_session_failed');
  return (await res.json()) as ChatSessionClientState;
}

export async function fetchChatSessionMessages(sessionId: string): Promise<{
  session: ChatSessionClientState;
  messages: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>;
}> {
  const res = await fetch(`/api/v1/ai/chat-sessions/${sessionId}/messages`, { method: 'GET' });
  if (!res.ok) throw new Error('fetch_messages_failed');
  return (await res.json()) as {
    session: ChatSessionClientState;
    messages: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>;
  };
}

export async function createNewChatSession(): Promise<ChatSessionClientState> {
  const res = await fetch('/api/v1/ai/chat-sessions', { method: 'POST' });
  if (!res.ok) throw new Error('create_session_failed');
  return (await res.json()) as ChatSessionClientState;
}

export async function closeChatSessionApi(sessionId: string): Promise<{
  session: ChatSessionClientState;
  memories_extracted: number;
}> {
  const res = await fetch(`/api/v1/ai/chat-sessions/${sessionId}/close`, { method: 'POST' });
  if (!res.ok) throw new Error('close_session_failed');
  return (await res.json()) as { session: ChatSessionClientState; memories_extracted: number };
}

export async function reopenChatSessionApi(sessionId: string): Promise<ChatSessionClientState> {
  const res = await fetch(`/api/v1/ai/chat-sessions/${sessionId}/reopen`, { method: 'POST' });
  if (!res.ok) throw new Error('reopen_session_failed');
  return (await res.json()) as ChatSessionClientState;
}
