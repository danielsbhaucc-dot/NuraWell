/**
 * אגירה עמידה לחילוץ התחייבויות — בלי LLM בזמן סגירת ה-stream.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function enqueueAlmogCommitmentJob(params: {
  admin: SupabaseClient;
  userId: string;
  sessionId?: string | null;
  userMessage: string;
  assistantMessage: string;
  rollingSummary?: string | null;
  habitTitles: string[];
  habitTitleToId: Record<string, string>;
  relatedStepId?: string | null;
}): Promise<{ enqueued: boolean; jobId?: string }> {
  const userMessage = params.userMessage.replace(/\s+/g, ' ').trim().slice(0, 4000);
  const assistantMessage = params.assistantMessage.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!userMessage || !assistantMessage) return { enqueued: false };

  const { data, error } = await params.admin
    .from('pending_almog_commitment_jobs')
    .insert({
      user_id: params.userId,
      session_id: params.sessionId ?? null,
      user_message: userMessage,
      assistant_message: assistantMessage,
      rolling_summary: params.rollingSummary?.slice(0, 4000) ?? null,
      habit_titles: params.habitTitles.slice(0, 40),
      habit_title_to_id: params.habitTitleToId,
      related_step_id: params.relatedStepId ?? null,
      processed: false,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('[almog-commitments] enqueue failed', {
      code: error.code,
      error: error.message,
    });
    return { enqueued: false };
  }

  return { enqueued: true, jobId: typeof data?.id === 'string' ? data.id : undefined };
}
