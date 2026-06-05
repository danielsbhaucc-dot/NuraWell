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
  windowDays: number;
}

function addBreakdown(a: CostBreakdown, b: CostBreakdown): void {
  a.chatUsd += b.chatUsd;
  a.notificationsUsd += b.notificationsUsd;
  a.videoUsd += b.videoUsd;
  a.totalUsd += b.totalUsd;
}

function finalizeBreakdown(b: CostBreakdown): void {
  b.totalUsd = b.chatUsd + b.notificationsUsd + b.videoUsd;
}

function readNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
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
  return computeChatCostUsd(row.model_name, {
    totalTokens: row.tokens_used ?? 0,
    outputTokens: readNum(meta.output_tokens),
    cacheReadTokens: readNum(meta.cache_read_input_tokens),
    cacheCreationTokens: readNum(meta.cache_creation_input_tokens),
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

  const [chatRes, notifRes, videoRes] = await Promise.all([
    admin
      .from('ai_interactions')
      .select('user_id, model_name, tokens_used, metadata')
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .gte('created_at', sinceIso),
    admin
      .from('notification_logs')
      .select('user_id, ai_model, metadata')
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
    admin
      .from('video_view_events')
      .select('user_id, estimated_seconds')
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
  ]);

  for (const row of (chatRes.data ?? []) as ChatRow[]) {
    breakdown.chatUsd += chatRowCost(row);
    counts.chatMessages += 1;
  }
  for (const row of (notifRes.data ?? []) as NotifRow[]) {
    const { cost, estimated } = notifRowCost(row);
    breakdown.notificationsUsd += cost;
    counts.notifications += 1;
    if (estimated) counts.notificationsEstimated += 1;
  }
  let videoSeconds = 0;
  for (const row of (videoRes.data ?? []) as VideoRow[]) {
    counts.videoViews += 1;
    videoSeconds += readNum(row.estimated_seconds);
  }
  counts.videoSeconds = videoSeconds;
  breakdown.videoUsd = computeVideoCostUsd(counts.videoViews, videoSeconds);

  finalizeBreakdown(breakdown);
  return { breakdown, counts };
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

  const [profilesRes, chatRes, notifRes, videoRes] = await Promise.all([
    admin.from('profiles').select('id, full_name'),
    admin
      .from('ai_interactions')
      .select('user_id, model_name, tokens_used, metadata')
      .eq('role', 'assistant')
      .gte('created_at', sinceIso)
      .limit(50000),
    admin
      .from('notification_logs')
      .select('user_id, ai_model, metadata')
      .gte('created_at', sinceIso)
      .limit(50000),
    admin
      .from('video_view_events')
      .select('user_id, estimated_seconds')
      .gte('created_at', sinceIso)
      .limit(50000),
  ]);

  const profiles = (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null }>;
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const totalUsers = profiles.length;

  for (const row of (chatRes.data ?? []) as ChatRow[]) {
    const r = ensure(row.user_id);
    r.breakdown.chatUsd += chatRowCost(row);
    r.counts.chatMessages += 1;
  }
  for (const row of (notifRes.data ?? []) as NotifRow[]) {
    const r = ensure(row.user_id);
    const { cost, estimated } = notifRowCost(row);
    r.breakdown.notificationsUsd += cost;
    r.counts.notifications += 1;
    if (estimated) r.counts.notificationsEstimated += 1;
  }
  for (const row of (videoRes.data ?? []) as VideoRow[]) {
    const r = ensure(row.user_id);
    r.counts.videoViews += 1;
    r.counts.videoSeconds += readNum(row.estimated_seconds);
  }

  const totals = emptyBreakdown();
  for (const row of perUser.values()) {
    row.breakdown.videoUsd = computeVideoCostUsd(row.counts.videoViews, row.counts.videoSeconds);
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
    notificationsUsd: totals.notificationsUsd / divUsers,
    videoUsd: totals.videoUsd / divUsers,
    totalUsd: totals.totalUsd / divUsers,
  };
  const averagePerActiveUser: CostBreakdown = {
    chatUsd: totals.chatUsd / divActive,
    notificationsUsd: totals.notificationsUsd / divActive,
    videoUsd: totals.videoUsd / divActive,
    totalUsd: totals.totalUsd / divActive,
  };

  const topUsers = Array.from(perUser.values())
    .sort((a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd)
    .slice(0, 20);

  return {
    totalUsers,
    totals,
    averagePerUser,
    averagePerActiveUser,
    activeUsers,
    topUsers,
    windowDays,
  };
}
