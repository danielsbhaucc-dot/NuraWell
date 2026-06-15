import { isAvoidPushActive } from '../avoid-push';
import { getAlmogPushTier } from '../life-context';
import type { RiskWindow } from '../risk-window';

export type GuardianBlockReason =
  | 'kill_switch'
  | 'not_opted_in'
  | 'avoid_push'
  | 'life_pause'
  | 'red_flag'
  | 'churned'
  | 'frequency_cap'
  | 'recently_active'
  | 'low_confidence'
  | 'low_sample'
  | 'low_date_spread';

export type GuardianGateResult =
  | { allowed: true }
  | { allowed: false; reason: GuardianBlockReason };

export type GuardianGateContext = {
  aiContext: Record<string, unknown> | null | undefined;
  engagementStatus: string | null | undefined;
  riskSignals: Record<string, unknown> | null | undefined;
  window: RiskWindow;
  touchesToday: number;
  touchesThisWeek: number;
  recentlyActive: boolean;
  killSwitch?: boolean;
};

export function guardianOptedIn(aiContext: Record<string, unknown> | null | undefined): boolean {
  const guardian = aiContext?.guardian;
  if (guardian && typeof guardian === 'object' && !Array.isArray(guardian)) {
    return (guardian as Record<string, unknown>).opted_in === true;
  }
  return aiContext?.guardian_opted_in === true;
}

export function evaluateGuardianGate(ctx: GuardianGateContext): GuardianGateResult {
  if (ctx.killSwitch) return { allowed: false, reason: 'kill_switch' };
  if (!guardianOptedIn(ctx.aiContext)) return { allowed: false, reason: 'not_opted_in' };
  if (isAvoidPushActive(ctx.aiContext)) return { allowed: false, reason: 'avoid_push' };
  if (getAlmogPushTier(ctx.aiContext ?? {}) === 'minimal') {
    return { allowed: false, reason: 'life_pause' };
  }
  if (ctx.riskSignals?.red_flag_at) return { allowed: false, reason: 'red_flag' };
  if (ctx.engagementStatus === 'churned') return { allowed: false, reason: 'churned' };
  if (ctx.touchesToday >= 1 || ctx.touchesThisWeek >= 3) {
    return { allowed: false, reason: 'frequency_cap' };
  }
  if (ctx.recentlyActive) return { allowed: false, reason: 'recently_active' };
  if (ctx.window.confidence < 0.6) return { allowed: false, reason: 'low_confidence' };
  if (ctx.window.sample_size < 3) return { allowed: false, reason: 'low_sample' };
  if (ctx.window.distinct_dates < 2) return { allowed: false, reason: 'low_date_spread' };
  return { allowed: true };
}
