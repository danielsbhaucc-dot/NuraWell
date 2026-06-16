/**
 * אורקסטרטור Memory Consolidation — אצווה יומית (05:00 IL, master cron).
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { synthesizeUserStrategy } from '../mentorship/synthesize-user-strategy';
import { MENTOR_VISIBLE_STATUSES } from '../insights/status';
import {
  consolidateMemoryWithLlm,
  MemoryConsolidationError,
} from './consolidate-with-llm';
import { executeMemoryOperations } from './execute-operations';
import type {
  InsightForConsolidation,
  MemoryConsolidationBatchResult,
  PendingChatLogRow,
} from './types';

const MAX_LOGS_PER_RUN = 300;
const MAX_USERS_PER_RUN = (() => {
  const raw = process.env.MEMORY_CONSOLIDATION_MAX_USERS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(32, Math.floor(n)) : 16;
})();
const MIN_LOG_CHARS_FOR_LLM = 80;
const MAX_INSIGHTS_PER_USER = 50;

const INSIGHT_SELECT =
  'id, category, insight_text, status, actionability_score, confidence, mention_count, created_at, updated_at, metadata' as const;

const LOG_SELECT = 'id, user_id, raw_chat_text, source_session_id, created_at' as const;

async function fetchUnprocessedLogs(
  admin: SupabaseClient,
  limit: number,
  beforeIso: string
): Promise<PendingChatLogRow[]> {
  const { data, error } = await admin
    .from('pending_chat_logs')
    .select(LOG_SELECT)
    .eq('processed', false)
    .lte('created_at', beforeIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[memory-consolidation] fetch logs failed', error.message);
    return [];
  }

  return (data ?? []) as PendingChatLogRow[];
}

async function fetchInsightsForUser(
  admin: SupabaseClient,
  userId: string
): Promise<InsightForConsolidation[]> {
  const { data, error } = await admin
    .from('user_insights')
    .select(INSIGHT_SELECT)
    .eq('user_id', userId)
    .in('status', [...MENTOR_VISIBLE_STATUSES, 'DEPRECATED'])
    .order('updated_at', { ascending: false })
    .limit(MAX_INSIGHTS_PER_USER);

  if (error) {
    console.warn('[memory-consolidation] fetch insights failed', { userId, error: error.message });
    return [];
  }

  return (data ?? []) as InsightForConsolidation[];
}

async function markLogsProcessed(
  admin: SupabaseClient,
  logIds: string[],
  now: Date
): Promise<void> {
  if (!logIds.length) return;

  const { error } = await admin
    .from('pending_chat_logs')
    .update({ processed: true, processed_at: now.toISOString() })
    .in('id', logIds);

  if (error) {
    throw new Error(`markLogsProcessed failed: ${error.message}`);
  }
}

function groupLogsByUser(logs: PendingChatLogRow[]): Map<string, PendingChatLogRow[]> {
  const map = new Map<string, PendingChatLogRow[]>();
  for (const log of logs) {
    const bucket = map.get(log.user_id) ?? [];
    bucket.push(log);
    map.set(log.user_id, bucket);
  }
  return map;
}

export async function runMemoryConsolidationBatch(
  admin: SupabaseClient,
  options?: { dryRun?: boolean; now?: Date; maxUsers?: number }
): Promise<MemoryConsolidationBatchResult> {
  const dryRun = options?.dryRun === true;
  const now = options?.now ?? new Date();
  const maxUsers = Math.min(MAX_USERS_PER_RUN, Math.max(1, options?.maxUsers ?? MAX_USERS_PER_RUN));

  const pendingLogs = await fetchUnprocessedLogs(admin, MAX_LOGS_PER_RUN, now.toISOString());
  if (!pendingLogs.length) {
    return {
      users_processed: 0,
      logs_processed: 0,
      operations_applied: 0,
      synthesis_triggered: 0,
      failed_users: 0,
      dry_run: dryRun,
    };
  }

  const byUser = groupLogsByUser(pendingLogs);
  const userIds = [...byUser.keys()].slice(0, maxUsers);

  if (dryRun) {
    return {
      users_processed: userIds.length,
      logs_processed: pendingLogs.length,
      operations_applied: 0,
      synthesis_triggered: 0,
      failed_users: 0,
      dry_run: true,
    };
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return {
      users_processed: 0,
      logs_processed: 0,
      operations_applied: 0,
      synthesis_triggered: 0,
      failed_users: userIds.length,
      dry_run: false,
      errors: ['OPENROUTER_API_KEY missing'],
    };
  }

  let operationsApplied = 0;
  let synthesisTriggered = 0;
  let failedUsers = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    const userLogs = byUser.get(userId) ?? [];
    const logIds = userLogs.map((l) => l.id);

    try {
      const insights = await fetchInsightsForUser(admin, userId);
      const logsCharCount = userLogs.reduce((n, l) => n + l.raw_chat_text.length, 0);

      if (logsCharCount < MIN_LOG_CHARS_FOR_LLM) {
        await markLogsProcessed(admin, logIds, now);
        continue;
      }

      const llmResult = await consolidateMemoryWithLlm({
        insights,
        pendingLogs: userLogs,
      });

      if (llmResult.operations.length > 0) {
        const exec = await executeMemoryOperations({
          admin,
          userId,
          operations: llmResult.operations,
          existingInsights: insights,
          sessionId: userLogs[userLogs.length - 1]?.source_session_id,
          now,
        });

        if (exec.errors > 0) {
          throw new Error(
            `Memory operations commit failed (${exec.errors} error(s); added=${exec.added} updated=${exec.updated})`
          );
        }

        const applied =
          exec.added + exec.updated + exec.deprecated + exec.verify;
        operationsApplied += applied;

        const needsStrategyRefresh = exec.added > 0 || exec.updated > 0;
        if (needsStrategyRefresh && process.env.OPENROUTER_API_KEY?.trim()) {
          try {
            await synthesizeUserStrategy(admin, userId, { now });
            synthesisTriggered += 1;
          } catch (synErr) {
            console.warn('[memory-consolidation] strategy synthesis failed (insights committed)', {
              userId,
              error: synErr instanceof Error ? synErr.message : String(synErr),
            });
          }
        }
      }

      await markLogsProcessed(admin, logIds, now);
    } catch (err) {
      failedUsers += 1;
      const msg =
        err instanceof MemoryConsolidationError
          ? `${userId}: ${err.code} — ${err.message}`
          : `${userId}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.warn('[memory-consolidation] user batch failed', msg);
    }
  }

  console.log(
    '[memory-consolidation-batch]',
    JSON.stringify({
      users: userIds.length,
      logs: pendingLogs.length,
      operationsApplied,
      synthesisTriggered,
      failedUsers,
    })
  );

  return {
    users_processed: userIds.length,
    logs_processed: pendingLogs.length,
    operations_applied: operationsApplied,
    synthesis_triggered: synthesisTriggered,
    failed_users: failedUsers,
    dry_run: false,
    errors: errors.length ? errors.slice(0, 12) : undefined,
  };
}
