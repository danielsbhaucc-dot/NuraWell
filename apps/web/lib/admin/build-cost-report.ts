/**
 * `build-cost-report` — מחשב עלות AI + Bunny פר-משתמש ובאגרגציה,
 * על בסיס הנתונים שנשמרים ב-Supabase:
 *   • ai_interactions (role='assistant')  → עלות צ'אט (קלוד + cache).
 *   • notification_logs                   → עלות התראות (טוקנים אמיתיים אם
 *                                            תועדו, אחרת אומדן).
 *   • video_view_events                   → עלות Bunny (לפי שניות צפייה).
 *
 * כל החישובים מבוססים על `cost-model.ts` (מחירון מרכזי, ניתן ל-override).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeChatCostUsd,
  computeSimpleCostUsd,
  computeVideoCostUsd,
  emptyBreakdown,
  estimateChatBackgroundUsd,
  NOTIFICATION_ESTIMATED_COMPLETION_TOKENS,
  NOTIFICATION_ESTIMATED_PROMPT_TOKENS,
  type CostBreakdown,
} from './cost-model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export interface CostCounts {
  chatMessages: number;
  notifications: number;
  notificationsEstimated: number;
  videoViews: number;
  videoSeconds: number;
}

export interface UserCostReport {
  breakdown: CostBreakdown;
  counts: CostCounts;
  byModel: Array<{ model: string; usd: number; messages: number }>;
}

export interface UserCostRow {
  userId: string;
  fullName: string | null;
  breakdown: CostBreakdown;
  counts: CostCounts;
}

export interface AggregateCostReport {
  /** מספר משתמשים שנכללו בחישוב (כל הפרופילים, גם ללא פעילות). */
  totalUsers: number;
  /** סך עלות לכל המשתמשים בחלון הזמן. */
  totals: CostBreakdown;
  /** עלות ממוצעת למשתמש = totals / totalUsers. */
  averagePerUser: CostBreakdown;
  /** עלות ממוצעת למשתמש *פעיל* (שיש לו לפחות פעילות אחת). */
  averagePerActiveUser: CostBreakdown;
  activeUsers: number;
  /** טופ-משתמשים יקרים, ממוין יורד. */
  topUsers: UserCostRow[];
  /** כל המשתמשים עם עלות מחושבת בחלון הזמן, כולל 0$. */
  users: UserCostRow[];
  windowDays: number;
}

function addBreakdown(a: CostBreakdown, b: CostBreakdown): void {
  a.chatUsd += b.chatUsd;
  a.backgroundUsd += b.backgroundUsd;
  a.notificationsUsd += b.notificationsUsd;
  a.videoUsd += b.videoUsd;
  a.totalUsd += b.totalUsd;
}

function finalizeBreakdown(b: CostBreakdown): void {
  b.totalUsd = b.chatUsd + b.backgroundUsd + b.notificationsUsd + b.videoUsd;
}

function readNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readOptNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

const PAGE_SIZE = 1000;
const MAX_ROWS = 200_000;

async function fetchAllRows<T>(
  run: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

// ---------- שורות גולמיות ----------

interface ChatRow {
  user_id: string;
  model_name: string | null;
  tokens_used: number | null;
  metadata: Record<string, unknown> | null;
}

interface NotifRow {
  user_id: string;
  ai_model: string | null;
  metadata: Record<string, unknown> | null;
}

interface VideoRow {
  user_id: string;
  estimated_seconds: number | null;
}

function chatRowCost(row: ChatRow): number {
  const meta = row.metadata ?? {};
  const billed = readNum(meta.provider_cost_usd);
  if (billed > 0) return billed;
  return computeChatCostUsd(row.model_name, {
    totalTokens: row.tokens_used ?? 0,
    inputTokens: readOptNum(meta.input_tokens),
    outputTokens: readOptNum(meta.output_tokens),
    cacheReadTokens: readOptNum(meta.cache_read_input_tokens),
    cacheCreationTokens: readOptNum(meta.cache_creation_input_tokens),
  });
}

/** מחזיר { cost, estimated } להתראה בודדת. */
function notifRowCost(row: NotifRow): { cost: number; estimated: boolean } {
  const meta = row.metadata ?? {};
  const prompt = meta.prompt_tokens;
  const completion = meta.completion_tokens;
  if (typeof prompt === 'number' || typeof completion === 'number') {
    return {
      cost: computeSimpleCostUsd(row.ai_model, readNum(prompt), readNum(completion)),
      estimated: false,
    };
  }
  // אין טוקנים מתועדים (התראה היסטורית) → אומדן.
  return {
    cost: computeSimpleCostUsd(
      row.ai_model,
      NOTIFICATION_ESTIMATED_PROMPT_TOKENS,
      NOTIFICATION_ESTIMATED_COMPLETION_TOKENS
    ),
    estimated: true,
  };
}

// ---------- פר-משתמש ----------

export async function buildUserCostReport(
  admin: DB,
  userId: string,
  sinceIso: string
): Promise<UserCostReport> {
  const breakdown = emptyBreakdown();
  const counts: CostCounts = {
    chatMessages: 0,
    notifications: 0,
    notificationsEstimated: 0,
    videoViews: 0,
    videoSeconds: 0,
  };

  const [chatRows, notifRows, videoRows] = await Promise.all([
    fetchAllRows<ChatRow>((from, to) =>
      admin
        .from('ai_interactions')
        .select('user_id, model_name, tokens_used, metadata')
        .eq('user_id', userId)
        .eq('role', 'assistant')
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
    fetchAllRows<NotifRow>((from, to) =>
      admin
        .from('notification_logs')
        .select('user_id, ai_model, metadata')
        .eq('user_id', userId)
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
    fetchAllRows<VideoRow>((from, to) =>
      admin
        .from('video_view_events')
        .select('user_id, estimated_seconds')
        .eq('user_id', userId)
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
  ]);

  const byModelMap = new Map<string, { usd: number; messages: number }>();
  for (const row of chatRows) {
    const cost = chatRowCost(row);
    breakdown.chatUsd += cost;
    counts.chatMessages += 1;
    const model = (row.model_name ?? 'unknown').trim() || 'unknown';
    const prev = byModelMap.get(model) ?? { usd: 0, messages: 0 };
    prev.usd += cost;
    prev.messages += 1;
    byModelMap.set(model, prev);
  }
  for (const row of notifRows) {
    const { cost, estimated } = notifRowCost(row);
    breakdown.notificationsUsd += cost;
    counts.notifications += 1;
    if (estimated) counts.notificationsEstimated += 1;
  }
  let videoSeconds = 0;
  for (const row of videoRows) {
    counts.videoViews += 1;
    videoSeconds += readNum(row.estimated_seconds);
  }
  counts.videoSeconds = videoSeconds;
  breakdown.videoUsd = computeVideoCostUsd(counts.videoViews, videoSeconds);
  breakdown.backgroundUsd = estimateChatBackgroundUsd(counts.chatMessages);

  finalizeBreakdown(breakdown);
  const byModel = Array.from(byModelMap.entries())
    .map(([model, v]) => ({ model, usd: v.usd, messages: v.messages }))
    .sort((a, b) => b.usd - a.usd);
  return { breakdown, counts, byModel };
}

// ---------- אגרגציה ----------

export async function buildAggregateCostReport(
  admin: DB,
  sinceIso: string,
  windowDays: number
): Promise<AggregateCostReport> {
  const perUser = new Map<string, UserCostRow>();

  const ensure = (userId: string): UserCostRow => {
    let row = perUser.get(userId);
    if (!row) {
      row = {
        userId,
        fullName: null,
        breakdown: emptyBreakdown(),
        counts: {
          chatMessages: 0,
          notifications: 0,
          notificationsEstimated: 0,
          videoViews: 0,
          videoSeconds: 0,
        },
      };
      perUser.set(userId, row);
    }
    return row;
  };

  const [profilesRes, chatRows, notifRows, videoRows] = await Promise.all([
    admin.from('profiles').select('id, full_name'),
    fetchAllRows<ChatRow>((from, to) =>
      admin
        .from('ai_interactions')
        .select('user_id, model_name, tokens_used, metadata')
        .eq('role', 'assistant')
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
    fetchAllRows<NotifRow>((from, to) =>
      admin
        .from('notification_logs')
        .select('user_id, ai_model, metadata')
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
    fetchAllRows<VideoRow>((from, to) =>
      admin
        .from('video_view_events')
        .select('user_id, estimated_seconds')
        .gte('created_at', sinceIso)
        .range(from, to)
    ),
  ]);

  const profiles = (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null }>;
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const totalUsers = profiles.length;

  for (const row of chatRows) {
    const r = ensure(row.user_id);
    r.breakdown.chatUsd += chatRowCost(row);
    r.counts.chatMessages += 1;
  }
  for (const row of notifRows) {
    const r = ensure(row.user_id);
    const { cost, estimated } = notifRowCost(row);
    r.breakdown.notificationsUsd += cost;
    r.counts.notifications += 1;
    if (estimated) r.counts.notificationsEstimated += 1;
  }
  for (const row of videoRows) {
    const r = ensure(row.user_id);
    r.counts.videoViews += 1;
    r.counts.videoSeconds += readNum(row.estimated_seconds);
  }

  const totals = emptyBreakdown();
  for (const row of perUser.values()) {
    row.breakdown.videoUsd = computeVideoCostUsd(row.counts.videoViews, row.counts.videoSeconds);
    row.breakdown.backgroundUsd = estimateChatBackgroundUsd(row.counts.chatMessages);
    finalizeBreakdown(row.breakdown);
    row.fullName = nameById.get(row.userId) ?? null;
    addBreakdown(totals, row.breakdown);
  }
  finalizeBreakdown(totals);

  const activeUsers = perUser.size;
  const divUsers = totalUsers > 0 ? totalUsers : 1;
  const divActive = activeUsers > 0 ? activeUsers : 1;

  const averagePerUser: CostBreakdown = {
    chatUsd: totals.chatUsd / divUsers,
    backgroundUsd: totals.backgroundUsd / divUsers,
    notificationsUsd: totals.notificationsUsd / divUsers,
    videoUsd: totals.videoUsd / divUsers,
    totalUsd: totals.totalUsd / divUsers,
  };
  const averagePerActiveUser: CostBreakdown = {
    chatUsd: totals.chatUsd / divActive,
    backgroundUsd: totals.backgroundUsd / divActive,
    notificationsUsd: totals.notificationsUsd / divActive,
    videoUsd: totals.videoUsd / divActive,
    totalUsd: totals.totalUsd / divActive,
  };

  const topUsers = Array.from(perUser.values())
    .sort((a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd)
    .slice(0, 20);

  const users = profiles
    .map((p) => {
      const existing = perUser.get(p.id);
      if (existing) return existing;
      return {
        userId: p.id,
        fullName: p.full_name,
        breakdown: emptyBreakdown(),
        counts: {
          chatMessages: 0,
          notifications: 0,
          notificationsEstimated: 0,
          videoViews: 0,
          videoSeconds: 0,
        },
      };
    })
    .sort((a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd);

  return {
    totalUsers,
    totals,
    averagePerUser,
    averagePerActiveUser,
    activeUsers,
    topUsers,
    users,
    windowDays,
  };
}
