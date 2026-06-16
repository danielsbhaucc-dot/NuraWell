export type ChatSessionStatus = 'open' | 'closed';

export type ChatSessionRow = {
  id: string;
  user_id: string;
  status: ChatSessionStatus;
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type ChatTranscriptTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};
