import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAggregateCostReport } from './build-cost-report';
import { computeMrrIls } from '@/lib/module-api/billing/lib-billing-service';
import type { Tier } from '@/lib/module-api/billing/lib-billing-tiers';

/**
 * Business dashboard metrics. REAL users only: profiles.role = 'user' (admin + 'test' e2e accounts excluded everywhere).
 */
export type BusinessMetrics = {
  windowDays: number;
  realUsers: number;
  newUsers: number;
  active7d: number;
  active30d: number;
  onboarded: number;
  subscribersByTier: Record<Tier, number>;
  trialing: number;
  trialConversions: number;
  mrrIls: number;
  arrIls: number;
  churned30d: number;
  churnRatePct: number;
  aiCostUsdTotal: number;
  aiCostUsdPerUser: number;
  aiCostUsdPerActiveUser: number;
  engagementStatus: Record<string, number>;
};

export async function buildBusinessMetrics(admin: SupabaseClient, windowDays = 30, now = new Date()): Promise<BusinessMetrics> {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: profiles } = await admin.from('profiles').select('id, created_at, last_active_at, onboarding_completed, engagement_status').eq('role', 'user').limit(50_000);
  const users = profiles ?? [];
  const ids = new Set(users.map((p) => p.id as string));

  const { data: subsRaw } = await admin.from('subscriptions').select('user_id, tier, billing_interval, status, trial_ends_at, canceled_at, current_period_end, created_at').limit(50_000);
  const subs = (subsRaw ?? []).filter((s) => ids.has(s.user_id as string));
  const paying = subs.filter((s) => s.status === 'active' || s.status === 'past_due');
  const byTier: Record<Tier, number> = { free: 0, premium: 0, pro: 0 };
  const payingUsers = new Set<string>();
  for (const s of paying) {
    byTier[s.tier as Tier]++;
    payingUsers.add(s.user_id as string);
  }
  byTier.free = users.length - payingUsers.size;
  const trialing = subs.filter((s) => s.status === 'trialing').length;
  const trialUsers = new Set(subs.filter((s) => s.trial_ends_at).map((s) => s.user_id as string));
  const trialConversions = [...trialUsers].filter((u) => payingUsers.has(u)).length;
  const churned30d = subs.filter((s) => s.canceled_at && (s.canceled_at as string) >= since).length;
  const payingAtStart = paying.length + churned30d;
  const mrrIls = computeMrrIls(paying as never);

  const cost = await buildAggregateCostReport(admin as never, since, windowDays);
  const realCostRows = cost.users.filter((u) => ids.has(u.userId));
  const aiTotal = realCostRows.reduce((a, u) => a + u.breakdown.totalUsd, 0);
  const activeCost = realCostRows.filter((u) => u.breakdown.totalUsd > 0).length;

  const engagementStatus: Record<string, number> = {};
  for (const p of users) {
    const k = (p.engagement_status as string) ?? 'unknown';
    engagementStatus[k] = (engagementStatus[k] ?? 0) + 1;
  }
  const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    windowDays,
    realUsers: users.length,
    newUsers: users.filter((p) => (p.created_at as string) >= since).length,
    active7d: users.filter((p) => p.last_active_at && (p.last_active_at as string) >= since7).length,
    active30d: users.filter((p) => p.last_active_at && (p.last_active_at as string) >= since).length,
    onboarded: users.filter((p) => p.onboarding_completed).length,
    subscribersByTier: byTier,
    trialing,
    trialConversions,
    mrrIls,
    arrIls: round(mrrIls * 12, 2),
    churned30d,
    churnRatePct: payingAtStart ? round((churned30d / payingAtStart) * 100, 1) : 0,
    aiCostUsdTotal: round(aiTotal),
    aiCostUsdPerUser: round(users.length ? aiTotal / users.length : 0),
    aiCostUsdPerActiveUser: round(activeCost ? aiTotal / activeCost : 0),
    engagementStatus,
  };
}
