export type PendingChatLogRow = {
  id: string;
  user_id: string;
  raw_chat_text: string;
  source_session_id: string | null;
  created_at: string;
};

export type InsightForConsolidation = {
  id: string;
  category: string;
  insight_text: string;
  status: string;
  actionability_score: number;
  confidence: number;
  mention_count: number;
  created_at: string;
  updated_at: string;
  metadata: { verify_prompt?: string; consolidation_reason?: string } | null;
};

export type ExecuteMemoryOperationsResult = {
  added: number;
  updated: number;
  deprecated: number;
  verify: number;
  skipped: number;
  errors: number;
};

export type MemoryConsolidationBatchResult = {
  users_processed: number;
  logs_processed: number;
  operations_applied: number;
  synthesis_triggered: number;
  failed_users: number;
  dry_run: boolean;
  errors?: string[];
};
