export type ChatSessionStatus = 'open' | 'closed';

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
