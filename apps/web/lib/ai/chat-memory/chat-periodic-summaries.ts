import { sealTableRow } from '@/lib/crypto/pii-seal';
import { decTableResult } from '@/lib/crypto/pii-fields';
import { withAiUser } from '@/lib/ai/usage-meter';
import { hasPlaceholderCorruption } from '../safety/memory-text-guard';
/**
 * סיכומים תקופתיים לשיחות — פירמידה daily → annual.
 * Cron: tier=daily|weekly|monthly|bi_monthly|quarterly|semi_annual|annual
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHAT_CHILD_TYPE,
  CHAT_SUMMARY_TYPES,
  buildChatPeriodKey,
  chatPeriodUtcBounds,
  getChatChildPeriodKeys,
  isValidChatPeriodKey,
  israelDateKey,
  israelDayUtcBounds,
  type ChatSummaryType,
} from './chat-period-keys';
import { fetchDailyChatSource } from './fetch-daily-chat-source';
import { CHAT_SUMMARY_MODEL, generateChatSummaryInsight } from './chat-summary-llm';

type SessionSummaryRow = {
  summary: string | null;
  closed_at: string | null;
  created_at: string;
};

type ChildInsight = { period_key: string; insight: string };

export type ChatSummaryTier = ChatSummaryType;

function fmtIsrael(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function fetchClosedSessionsInRange(
  admin: SupabaseClient,
  userId: string,
  startIso: string,
  endIso: string
): Promise<SessionSummaryRow[]> {
  const { data, error } = await admin
    .from('chat_sessions')
    .select('summary, closed_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .gte('closed_at', startIso)
    .lte('closed_at', endIso)
    .not('summary', 'is', null)
    .order('closed_at', { ascending: true }).then(decTableResult('chat_sessions', userId));

  if (error) throw error;
  return (data ?? []) as SessionSummaryRow[];
}

async function fetchChildInsights(
  admin: SupabaseClient,
  userId: string,
  childType: ChatSummaryType,
  childKeys: string[]
): Promise<ChildInsight[]> {
  if (!childKeys.length) return [];
  const { data, error } = await admin
    .from('chat_periodic_summaries')
    .select('period_key, ai_insight')
    .eq('user_id', userId)
    .eq('type', childType)
    .in('period_key', childKeys).then(decTableResult('chat_periodic_summaries', userId));

  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      period_key: r.period_key as string,
      insight: String(r.ai_insight ?? '').trim(),
    }))
    .filter((r) => r.insight.length > 0);
}

function formatSessionLines(sessions: SessionSummaryRow[]): string {
  return sessions
    .map((s) => {
      const when = fmtIsrael(s.closed_at ?? s.created_at);
      return `[${when}] ${(s.summary ?? '').trim()}`;
    })
    .join('\n');
}

async function fetchFirstName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const name = (data?.full_name as string | null)?.trim().split(/\s+/)[0];
  return name || 'חבר';
}

async function upsertChatPeriodicSummary(
  admin: SupabaseClient,
  row: {
    userId: string;
    type: ChatSummaryType;
    periodKey: string;
    sessionCount: number;
    aiInsight: string;
    metrics?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin.from('chat_periodic_summaries').upsert(await sealTableRow('chat_periodic_summaries', {
      user_id: row.userId,
      type: row.type,
      period_key: row.periodKey,
      session_count: row.sessionCount,
      metrics: { session_count: row.sessionCount, ...row.metrics },
      ai_insight: row.aiInsight,
      ai_model: CHAT_SUMMARY_MODEL,
      updated_at: new Date().toISOString(),
    }, row.userId),
    { onConflict: 'user_id,type,period_key' }
  );
  if (error) throw error;
}

async function ensureChildSummaries(
  admin: SupabaseClient,
  userId: string,
  type: ChatSummaryType,
  periodKey: string
): Promise<ChildInsight[]> {
  const childType = CHAT_CHILD_TYPE[type];
  if (!childType) return [];

  const childKeys = getChatChildPeriodKeys(type, periodKey);
  let insights = await fetchChildInsights(admin, userId, childType, childKeys);

  for (const key of childKeys) {
    if (!insights.some((c) => c.period_key === key)) {
      await generateAndStoreChatPeriodicSummary(admin, {
        userId,
        type: childType,
        periodKey: key,
      });
    }
  }

  insights = await fetchChildInsights(admin, userId, childType, childKeys);
  return insights;
}

async function buildSourceBlock(
  admin: SupabaseClient,
  userId: string,
  type: ChatSummaryType,
  periodKey: string
): Promise<{ sourceBlock: string; sessionCount: number; metrics: Record<string, unknown> }> {
  if (type === 'daily') {
    const daily = await fetchDailyChatSource(admin, userId, periodKey);
    const parts: string[] = [];
    if (daily.interactionLines) parts.push(`תמליל:\n${daily.interactionLines}`);
    if (daily.sessionLines) parts.push(`סשנים:\n${daily.sessionLines}`);
    return {
      sourceBlock: parts.join('\n\n'),
      sessionCount: daily.sessionCount,
      metrics: {
        interaction_count: daily.interactionCount,
        session_count: daily.sessionCount,
      },
    };
  }

  const { start, end } = chatPeriodUtcBounds(type, periodKey);
  const sessions = await fetchClosedSessionsInRange(
    admin,
    userId,
    start.toISOString(),
    end.toISOString()
  );

  return {
    sourceBlock: formatSessionLines(sessions),
    sessionCount: sessions.length,
    metrics: { session_count: sessions.length },
  };
}

export async function generateAndStoreChatPeriodicSummary(
  admin: SupabaseClient,
  params: { userId: string; type: ChatSummaryType; periodKey: string }
): Promise<{ sessionCount: number; generated: boolean }> {
  if (!isValidChatPeriodKey(params.type, params.periodKey)) {
    throw new Error(`Invalid period key: ${params.type}/${params.periodKey}`);
  }

  const childInsights = await ensureChildSummaries(
    admin,
    params.userId,
    params.type,
    params.periodKey
  );

  const { sourceBlock, sessionCount, metrics } = await buildSourceBlock(
    admin,
    params.userId,
    params.type,
    params.periodKey
  );

  if (!sourceBlock.trim() && childInsights.length === 0) {
    return { sessionCount: 0, generated: false };
  }

  const firstName = await fetchFirstName(admin, params.userId);
  const aiInsight = await withAiUser(params.userId, 'chat_periodic_summary', () => generateChatSummaryInsight({
    type: params.type,
    periodKey: params.periodKey,
    firstName,
    sourceBlock,
    childInsights,
  }));

  if (!aiInsight.trim() || hasPlaceholderCorruption(aiInsight)) {
    return { sessionCount, generated: false };
  }

  await upsertChatPeriodicSummary(admin, {
    userId: params.userId,
    type: params.type,
    periodKey: params.periodKey,
    sessionCount,
    aiInsight,
    metrics,
  });

  return { sessionCount, generated: true };
}

async function fetchUsersWithChatActivity(
  admin: SupabaseClient,
  sinceIso: string,
  limit: number,
  untilIso?: string
): Promise<string[]> {
  let q = admin
    .from('ai_interactions')
    .select('user_id')
    .gte('created_at', sinceIso)
    .eq('role', 'user')
    .limit(5000);
  if (untilIso) q = q.lte('created_at', untilIso);
  const { data, error } = await q;

  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.user_id as string))].slice(0, limit);
}


/** Reference instant inside the period that just closed: 12h before now (03:00 IL → yesterday 15:00). */
export function closedPeriodReference(now = new Date()): Date {
  return new Date(now.getTime() - 12 * 60 * 60 * 1000);
}

/** האם ה-cron צריך לרוץ ברמה זו היום (ישראל) */
export function shouldRunChatSummaryTier(tier: ChatSummaryTier, now = new Date()): boolean {
  const il = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(now);

  const weekday = il.find((p) => p.type === 'weekday')?.value ?? '';
  const day = Number.parseInt(il.find((p) => p.type === 'day')?.value ?? '0', 10);
  const month = Number.parseInt(il.find((p) => p.type === 'month')?.value ?? '0', 10);

  switch (tier) {
    case 'daily':
      return true;
    case 'weekly':
      // runs the night after the week closes (Sat→Sun); summarises the week that ended yesterday
      return weekday === 'Sun';
    case 'monthly':
      return day === 1;
    case 'bi_monthly':
      return day === 1 && (month === 1 || month === 3 || month === 5 || month === 7 || month === 9 || month === 11);
    case 'quarterly':
      return day === 1 && (month === 1 || month === 4 || month === 7 || month === 10);
    case 'semi_annual':
      return day === 1 && (month === 1 || month === 7);
    case 'annual':
      return day === 1 && month === 1;
    default:
      return false;
  }
}

export async function runChatPeriodicSummariesBatch(
  admin: SupabaseClient,
  params: {
    limit?: number;
    tier?: ChatSummaryTier;
    /** YYYY-MM-DD ישראל — לסיכום יומי; ברירת מחדל: היום */
    dateKey?: string;
    force?: boolean;
  } = {}
): Promise<{
  tier: ChatSummaryTier;
  users: number;
  generated: number;
  skipped_schedule: boolean;
  errors: number;
}> {
  const tier = params.tier ?? 'daily';
  if (!CHAT_SUMMARY_TYPES.includes(tier)) {
    throw new Error(`Unknown tier: ${tier}`);
  }

  const now = new Date();
  if (!params.force && !shouldRunChatSummaryTier(tier, now)) {
    return { tier, users: 0, generated: 0, skipped_schedule: true, errors: 0 };
  }

  const limit = params.limit ?? 40;
  // The nightly run (03:00 IL) summarises the period that just CLOSED — yesterday / last week /
  // last month. Summarising "today" at 03:00 found no chat and nothing was ever stored
  // (chat_periodic_summaries had 0 rows in prod until 13.10.2026).
  const ref = closedPeriodReference(now);
  const dateKey = params.dateKey ?? israelDateKey(ref);
  const periodKey = tier === 'daily' ? dateKey : buildChatPeriodKey(tier, ref);
  const bounds =
    tier === 'daily'
      ? israelDayUtcBounds(dateKey)
      : chatPeriodUtcBounds(tier, periodKey);

  const userIds = await fetchUsersWithChatActivity(
    admin,
    bounds.start.toISOString(),
    limit,
    bounds.end.toISOString()
  );
  let generated = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const result = await generateAndStoreChatPeriodicSummary(admin, {
        userId,
        type: tier,
        periodKey,
      });
      if (result.generated) generated += 1;
    } catch (e) {
      errors += 1;
      console.warn('[chat-periodic-summaries] user failed', {
        userId,
        tier,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { tier, users: userIds.length, generated, skipped_schedule: false, errors };
}

/** מריץ את כל הרמות שמגיעות בתור היום (ל-cron יחיד אופציונלי) */
export async function runAllDueChatSummaryTiers(
  admin: SupabaseClient,
  params: { limit?: number } = {}
): Promise<Array<Awaited<ReturnType<typeof runChatPeriodicSummariesBatch>>>> {
  const results: Array<Awaited<ReturnType<typeof runChatPeriodicSummariesBatch>>> = [];
  for (const tier of CHAT_SUMMARY_TYPES) {
    if (shouldRunChatSummaryTier(tier)) {
      results.push(await runChatPeriodicSummariesBatch(admin, { ...params, tier }));
    }
  }
  return results;
}
