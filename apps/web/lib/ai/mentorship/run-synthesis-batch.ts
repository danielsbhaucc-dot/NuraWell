/**
 * סינתזת אסטרטגיית מנטור — אצווה ל-cron ערב (habit-checkpoints?slot=evening).
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { synthesizeUserStrategy } from './synthesize-user-strategy';
import { INSIGHT_STATUS } from '../insights/status';

/** כמה משתמשים לסנתז בכל ריצת ערב — חסכון בעלות LLM. */
const EVENING_SYNTHESIS_BATCH_LIMIT = 12;

type InsightActivityRow = {
  user_id: string;
  last_seen_at: string;
  updated_at: string;
};

export type MentorshipSynthesisBatchResult = {
  candidates: number;
  synthesized: number;
  skipped_fresh: number;
  failed: number;
  dry_run: boolean;
  user_ids?: string[];
  errors?: string[];
};

function latestInsightIso(row: InsightActivityRow): string {
  const seen = Date.parse(row.last_seen_at);
  const updated = Date.parse(row.updated_at);
  if (Number.isFinite(seen) && Number.isFinite(updated)) {
    return seen >= updated ? row.last_seen_at : row.updated_at;
  }
  return row.last_seen_at || row.updated_at;
}

/**
 * מוצא משתמשים שיש להם תובנות פעילות והאסטרטגיה שלהם מיושנת או חסרה.
 */
async function listUsersNeedingSynthesis(
  admin: SupabaseClient,
  limit: number
): Promise<{ userId: string; latestInsightAt: string }[]> {
  const { data: insightRows, error } = await admin
    .from('user_insights')
    .select('user_id, last_seen_at, updated_at')
    .eq('status', INSIGHT_STATUS.ACTIVE)
    .order('last_seen_at', { ascending: false })
    .limit(250);

  if (error) {
    console.warn('[mentorship-batch] fetch insights failed', error.message);
    return [];
  }

  const latestByUser = new Map<string, string>();
  for (const row of (insightRows ?? []) as InsightActivityRow[]) {
    if (!row.user_id) continue;
    const iso = latestInsightIso(row);
    const prev = latestByUser.get(row.user_id);
    if (!prev || Date.parse(iso) > Date.parse(prev)) {
      latestByUser.set(row.user_id, iso);
    }
  }

  const userIds = [...latestByUser.entries()]
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .map(([userId]) => userId);

  if (userIds.length === 0) return [];

  const { data: strategyRows } = await admin
    .from('user_mentorship_strategy')
    .select('user_id, updated_at')
    .in('user_id', userIds.slice(0, 200));

  const strategyUpdated = new Map<string, string>();
  for (const row of (strategyRows ?? []) as { user_id: string; updated_at: string }[]) {
    strategyUpdated.set(row.user_id, row.updated_at);
  }

  const stale: { userId: string; latestInsightAt: string }[] = [];
  for (const userId of userIds) {
    const latestInsightAt = latestByUser.get(userId)!;
    const strategyAt = strategyUpdated.get(userId);
    if (!strategyAt || Date.parse(latestInsightAt) > Date.parse(strategyAt)) {
      stale.push({ userId, latestInsightAt });
    }
    if (stale.length >= limit) break;
  }

  return stale;
}

/**
 * מריץ סינתזה למשתמשים שצריכים עדכון. נקרא מ-cron ערב בלבד.
 */
export async function runMentorshipSynthesisBatch(
  admin: SupabaseClient,
  options?: { dryRun?: boolean; limit?: number; now?: Date }
): Promise<MentorshipSynthesisBatchResult> {
  const limit = Math.min(50, Math.max(1, options?.limit ?? EVENING_SYNTHESIS_BATCH_LIMIT));
  const dryRun = options?.dryRun === true;
  const now = options?.now ?? new Date();

  const needing = await listUsersNeedingSynthesis(admin, limit);
  const totalCandidates = needing.length;

  if (dryRun || needing.length === 0) {
    return {
      candidates: totalCandidates,
      synthesized: 0,
      skipped_fresh: 0,
      failed: 0,
      dry_run: dryRun,
      user_ids: needing.map((n) => n.userId),
    };
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return {
      candidates: totalCandidates,
      synthesized: 0,
      skipped_fresh: 0,
      failed: totalCandidates,
      dry_run: false,
      errors: ['OPENROUTER_API_KEY missing'],
    };
  }

  let synthesized = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const { userId } of needing) {
    try {
      const result = await synthesizeUserStrategy(admin, userId, { now });
      if (result.ok && !result.used_default) {
        synthesized += 1;
      } else if (!result.ok) {
        failed += 1;
        if (result.error) errors.push(`${userId}: ${result.error}`);
      } else {
        synthesized += 1;
      }
    } catch (e) {
      failed += 1;
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    '[mentorship-synthesis-batch]',
    JSON.stringify({ candidates: totalCandidates, synthesized, failed })
  );

  return {
    candidates: totalCandidates,
    synthesized,
    skipped_fresh: 0,
    failed,
    dry_run: false,
    errors: errors.length ? errors.slice(0, 10) : undefined,
  };
}
