/**
 * ביצוע פעולות זיכרון ב-Supabase — יעיל, עם ולידציה מקדימה של insight_id.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { insightDedupeKey } from '../insights/persist-insights';
import { INSIGHT_STATUS } from '../insights/status';
import type { MemoryOperation } from './schema';
import type { ExecuteMemoryOperationsResult, InsightForConsolidation } from './types';

function mergeMetadata(
  existing: InsightForConsolidation['metadata'],
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

export async function executeMemoryOperations(params: {
  admin: SupabaseClient;
  userId: string;
  operations: MemoryOperation[];
  existingInsights: InsightForConsolidation[];
  sessionId?: string | null;
  now?: Date;
}): Promise<ExecuteMemoryOperationsResult> {
  const { admin, userId, operations, existingInsights } = params;
  const nowIso = (params.now ?? new Date()).toISOString();
  const result: ExecuteMemoryOperationsResult = {
    added: 0,
    updated: 0,
    deprecated: 0,
    verify: 0,
    skipped: 0,
    errors: 0,
  };

  const byId = new Map(existingInsights.map((row) => [row.id, row]));

  for (const op of operations) {
    try {
      if (op.op === 'ADD') {
        const key = insightDedupeKey(op.category, op.insight_text);
        if (!key || key.endsWith('|')) {
          result.skipped += 1;
          continue;
        }

        const duplicate = existingInsights.find(
          (row) =>
            row.status !== INSIGHT_STATUS.DEPRECATED &&
            insightDedupeKey(row.category, row.insight_text) === key
        );

        if (duplicate) {
          const { error } = await admin
            .from('user_insights')
            .update({
              insight_text: op.insight_text,
              actionability_score: Math.max(duplicate.actionability_score, op.actionability_score),
              confidence: op.confidence,
              status: INSIGHT_STATUS.ACTIVE,
              mention_count: duplicate.mention_count + 1,
              last_seen_at: nowIso,
              metadata: mergeMetadata(duplicate.metadata, {
                evidence: op.evidence,
                consolidation_reason: 'dedupe_merge_on_add',
              }),
            })
            .eq('id', duplicate.id)
            .eq('user_id', userId);

          if (error) result.errors += 1;
          else result.updated += 1;
          continue;
        }

        const { error } = await admin.from('user_insights').insert({
          user_id: userId,
          category: op.category,
          insight_text: op.insight_text,
          actionability_score: op.actionability_score,
          confidence: op.confidence,
          status: INSIGHT_STATUS.ACTIVE,
          is_active: true,
          dedupe_key: key,
          mention_count: 1,
          last_seen_at: nowIso,
          source_session_id: params.sessionId ?? null,
          metadata: op.evidence ? { evidence: op.evidence } : {},
        });

        if (error) result.errors += 1;
        else result.added += 1;
        continue;
      }

      const existing = byId.get(op.insight_id);
      if (!existing) {
        result.skipped += 1;
        continue;
      }

      if (op.op === 'UPDATE') {
        const category = op.category ?? existing.category;
        const key = insightDedupeKey(category, op.insight_text);

        const { error } = await admin
          .from('user_insights')
          .update({
            category,
            insight_text: op.insight_text,
            dedupe_key: key,
            actionability_score: op.actionability_score ?? existing.actionability_score,
            confidence: op.confidence ?? existing.confidence,
            status: INSIGHT_STATUS.ACTIVE,
            mention_count: existing.mention_count + 1,
            last_seen_at: nowIso,
            metadata: mergeMetadata(existing.metadata, {
              consolidation_reason: op.reason,
            }),
          })
          .eq('id', op.insight_id)
          .eq('user_id', userId);

        if (error) result.errors += 1;
        else result.updated += 1;
        continue;
      }

      if (op.op === 'DEPRECATE') {
        const { error } = await admin
          .from('user_insights')
          .update({
            status: INSIGHT_STATUS.DEPRECATED,
            metadata: mergeMetadata(existing.metadata, {
              consolidation_reason: op.reason,
              deprecated_at: nowIso,
            }),
          })
          .eq('id', op.insight_id)
          .eq('user_id', userId);

        if (error) result.errors += 1;
        else result.deprecated += 1;
        continue;
      }

      if (op.op === 'VERIFY') {
        const { error } = await admin
          .from('user_insights')
          .update({
            status: INSIGHT_STATUS.NEEDS_VERIFICATION,
            metadata: mergeMetadata(existing.metadata, {
              verify_prompt: op.verify_prompt,
              consolidation_reason: op.reason,
              verification_requested_at: nowIso,
            }),
          })
          .eq('id', op.insight_id)
          .eq('user_id', userId);

        if (error) result.errors += 1;
        else result.verify += 1;
      }
    } catch (e) {
      console.warn('[memory-consolidation] operation failed', {
        op: op.op,
        error: e instanceof Error ? e.message : String(e),
      });
      result.errors += 1;
    }
  }

  return result;
}
