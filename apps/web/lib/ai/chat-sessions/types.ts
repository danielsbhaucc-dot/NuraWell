export type ChatSessionStatus = 'open' | 'closed';

export type ChatSessionKind = 'chat' | 'profile_update';

export type ChatSessionListItem = {
  id: string;
  status: 'open' | 'closed';
  session_kind: ChatSessionKind;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  preview_text: string | null;
  message_count: number;
};

export type ChatSessionRow = {
  id: string;
  user_id: string;
  status: ChatSessionStatus;
  title: string | null;
  summary: string | null;
  live_conversation_file: string | null;
  preview_text?: string | null;
  message_count?: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type ChatTranscriptTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};
