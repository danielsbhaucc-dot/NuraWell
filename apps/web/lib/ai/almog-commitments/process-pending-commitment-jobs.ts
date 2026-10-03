/**
 * ניקוז תור חילוץ התחייבויות — אותה לוגיקת extract+persist כמו בנתיב הצ׳אט.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractAlmogCommitments } from './extract-commitments';
import { persistCommitmentExtraction } from './persist';

type JobRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  user_message: string;
  assistant_message: string;
  rolling_summary: string | null;
  habit_titles: unknown;
  habit_title_to_id: unknown;
  related_step_id: string | null;
  attempts: number;
  max_attempts: number;
};

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function asTitleIdMap(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw || typeof raw !== 'object') return map;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'string' && k && v) map.set(k, v);
  }
  return map;
}

export type ProcessCommitmentJobsResult = {
  claimed: number;
  processed: number;
  failed: number;
};

export async function processPendingAlmogCommitmentJobs(
  admin: SupabaseClient,
  opts?: { limit?: number; jobId?: string; userId?: string }
): Promise<ProcessCommitmentJobsResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 40);
  let query = admin
    .from('pending_almog_commitment_jobs')
    .select(
      'id, user_id, session_id, user_message, assistant_message, rolling_summary, habit_titles, habit_title_to_id, related_step_id, attempts, max_attempts'
    )
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (opts?.jobId) query = query.eq('id', opts.jobId);
  if (opts?.userId) query = query.eq('user_id', opts.userId);

  const { data, error } = await query;
  if (error) {
    console.warn('[almog-commitments] claim jobs failed', {
      code: error.code,
      error: error.message,
    });
    return { claimed: 0, processed: 0, failed: 0 };
  }

  const jobs = (data ?? []) as JobRow[];
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const nextAttempts = (job.attempts ?? 0) + 1;
    try {
      const habitTitles = asStringArray(job.habit_titles);
      const habitTitleToId = asTitleIdMap(job.habit_title_to_id);

      const { data: openBlockerRows } = await admin
        .from('almog_blockers')
        .select('id, description')
        .eq('user_id', job.user_id)
        .in('status', ['open', 'improving'])
        .order('identified_at', { ascending: false })
        .limit(6);

      const blockerTagToId = new Map<string, string>();
      const openBlockers = ((openBlockerRows ?? []) as { id: string; description: string }[]).map(
        (b, i) => {
          const tag = `B${i + 1}`;
          blockerTagToId.set(tag, b.id);
          return { tag, description: b.description };
        }
      );

      const extraction = await extractAlmogCommitments({
        userMessage: job.user_message,
        assistantMessage: job.assistant_message,
        rollingSummary: job.rolling_summary,
        habitTitles: habitTitles.length > 0 ? habitTitles : [...habitTitleToId.keys()],
        openBlockers,
      });

      const persistResult = await persistCommitmentExtraction({
        admin,
        userId: job.user_id,
        sessionId: job.session_id,
        extraction,
        habitTitleToId,
        blockerTagToId,
        relatedStepId: job.related_step_id,
        sourceExcerpt: job.user_message.slice(0, 280),
      });

      await admin
        .from('pending_almog_commitment_jobs')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          attempts: nextAttempts,
          last_error: null,
        })
        .eq('id', job.id);

      processed += 1;
      if (
        persistResult.assignments_created ||
        persistResult.reminders_created ||
        persistResult.blockers_upserted ||
        persistResult.blockers_updated ||
        persistResult.focus_action !== 'none'
      ) {
        console.info('[almog-commitments] job persisted', {
          job_id: job.id,
          ...persistResult,
        });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const giveUp = nextAttempts >= (job.max_attempts ?? 5);
      await admin
        .from('pending_almog_commitment_jobs')
        .update({
          attempts: nextAttempts,
          last_error: message.slice(0, 800),
          processed: giveUp,
          processed_at: giveUp ? new Date().toISOString() : null,
        })
        .eq('id', job.id);
      console.warn('[almog-commitments] job failed', {
        job_id: job.id,
        attempts: nextAttempts,
        give_up: giveUp,
        error: message,
      });
    }
  }

  return { claimed: jobs.length, processed, failed };
}
