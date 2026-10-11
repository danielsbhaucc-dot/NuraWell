import type { SupabaseClient } from '@supabase/supabase-js';
import { TRIAL_DAYS, TRIAL_TIER, TIERS } from './tiers';
import type { NormalizedBillingEvent } from './provider';

/** Start the one-time free trial. Idempotent: the DB allows one trial row per user ever. */
export async function startTrial(admin: SupabaseClient, userId: string, now = new Date()) {
  const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('subscriptions')
    .insert({ user_id: userId, tier: TRIAL_TIER, status: 'trialing', provider: 'none', trial_ends_at: trialEnds })
    .select('id, trial_ends_at')
    .single();
  if (error) return { ok: false as const, reason: error.code === '23505' ? ('trial_used' as const) : ('failed' as const) };
  await admin.from('billing_events').insert({ user_id: userId, subscription_id: data.id, kind: 'trial_started', metadata: { days: TRIAL_DAYS } });
  return { ok: true as const, trialEndsAt: data.trial_ends_at as string };
}

/** Apply normalized provider events (idempotent on provider_event_id). */
export async function applyBillingEvents(admin: SupabaseClient, provider: string, events: NormalizedBillingEvent[]) {
  for (const ev of events) {
    const { error: dup } = await admin
      .from('billing_events')
      .insert({ provider, provider_event_id: ev.providerEventId, kind: ev.kind, user_id: ev.userId ?? null, amount_ils: ev.amountIls ?? null, metadata: { ref: ev.providerRef } });
    if (dup?.code === '23505') continue; // already processed
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin.from('subscriptions').select('id').eq('provider', provider).eq('provider_ref', ev.providerRef).maybeSingle();
    if (ev.kind === 'activated' && !existing && ev.userId && ev.tier) {
      await admin.from('subscriptions').insert({ user_id: ev.userId, tier: ev.tier, billing_interval: ev.interval ?? 'monthly', status: 'active', provider, provider_ref: ev.providerRef, current_period_end: ev.currentPeriodEnd ?? null });
      continue;
    }
    if (!existing) continue;
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (ev.kind === 'activated' || ev.kind === 'renewed') Object.assign(patch, { status: 'active', current_period_end: ev.currentPeriodEnd ?? null, cancel_at_period_end: false });
    if (ev.kind === 'canceled') Object.assign(patch, { status: 'canceled', cancel_at_period_end: true, canceled_at: nowIso });
    if (ev.kind === 'expired') Object.assign(patch, { status: 'expired' });
    if (ev.kind === 'payment_failed') Object.assign(patch, { status: 'past_due' });
    await admin.from('subscriptions').update(patch).eq('id', existing.id);
  }
}

/** Monthly recurring revenue (ILS) from paying subscriptions. Pure. */
export function computeMrrIls(subs: { tier: keyof typeof TIERS; billing_interval: 'monthly' | 'annual' | null; status: string }[]): number {
  let mrr = 0;
  for (const s of subs) {
    if (s.status !== 'active' && s.status !== 'past_due') continue;
    const interval = s.billing_interval ?? 'monthly';
    const price = TIERS[s.tier].priceIls[interval];
    mrr += interval === 'annual' ? price / 12 : price;
  }
  return Math.round(mrr * 100) / 100;
}
