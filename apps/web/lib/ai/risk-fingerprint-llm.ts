import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeFrictionCategory, normalizeStrategyType } from './almog-commitments/friction';
import type { RiskFingerprint, RiskWindow } from './risk-window';
import { detectRelapseInMessage } from './roller-coaster';

const JERUSALEM_TIMEZONE = 'Asia/Jerusalem';
const LOOKBACK_DAYS = 45;
const MIN_SAMPLE_SIZE = 3;
const MIN_DISTINCT_DATES = Math.min(
  3,
  Math.max(2, Number(process.env.GUARDIAN_MIN_DISTINCT_DATES) || 2)
);

export type RiskEvent = {
  createdAt: string;
  trigger: string | null;
  source: 'sos' | 'relapse_chat' | 'missed_task';
};

type Bucket = {
  weekday: number;
  start_hhmm: string;
  triggerCounts: Map<string, number>;
  sources: Set<RiskEvent['source']>;
  dates: Set<string>;
  sampleSize: number;
};

function sinceIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function eventLocalParts(iso: string): {
  dateKey: string;
  weekday: number;
  hour: number;
  minute: number;
} | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JERUSALEM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));

  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekday >= 0 ? weekday : 0,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function bucketStartHhmm(hour: number, minute: number): string {
  const roundedMinute = minute < 30 ? 0 : 30;
  return `${String(hour).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`;
}

function addEventToBuckets(map: Map<string, Bucket>, event: RiskEvent): void {
  const local = eventLocalParts(event.createdAt);
  if (!local || !Number.isFinite(local.hour) || !Number.isFinite(local.minute)) return;
  const start = bucketStartHhmm(local.hour, local.minute);
  const key = `${local.weekday}|${start}`;
  const bucket =
    map.get(key) ??
    {
      weekday: local.weekday,
      start_hhmm: start,
      triggerCounts: new Map<string, number>(),
      sources: new Set<RiskEvent['source']>(),
      dates: new Set<string>(),
      sampleSize: 0,
    };

  const trigger = normalizeFrictionCategory(event.trigger ?? defaultTriggerForSource(event.source));
  bucket.sampleSize += 1;
  bucket.dates.add(local.dateKey);
  bucket.sources.add(event.source);
  bucket.triggerCounts.set(trigger, (bucket.triggerCounts.get(trigger) ?? 0) + 1);
  map.set(key, bucket);
}

function defaultTriggerForSource(source: RiskEvent['source']): string {
  if (source === 'missed_task') return 'motivational';
  if (source === 'relapse_chat') return 'emotional';
  return 'emotional';
}

function dominantTrigger(bucket: Bucket): string {
  let best = 'emotional';
  let bestCount = -1;
  for (const [trigger, count] of bucket.triggerCounts.entries()) {
    if (count > bestCount) {
      best = trigger;
      bestCount = count;
    }
  }
  return best;
}

export function buildRiskFingerprintFromEvents(
  events: RiskEvent[],
  now = new Date()
): RiskFingerprint {
  const buckets = new Map<string, Bucket>();
  for (const event of events) addEventToBuckets(buckets, event);

  const maxBucketSize = Math.max(1, ...Array.from(buckets.values()).map((bucket) => bucket.sampleSize));
  const windows: RiskWindow[] = Array.from(buckets.values())
    .map((bucket) => {
      const distinctDates = bucket.dates.size;
      const hasStatisticalSpread = bucket.sampleSize >= MIN_SAMPLE_SIZE && distinctDates >= MIN_DISTINCT_DATES;
      const densityScore = Math.min(1, bucket.sampleSize / Math.max(MIN_SAMPLE_SIZE, maxBucketSize));
      const spreadScore = Math.min(1, distinctDates / MIN_DISTINCT_DATES);
      const sourceScore = Math.min(1, bucket.sources.size / 2);
      const confidence = hasStatisticalSpread
        ? Math.max(0.6, Math.min(0.92, 0.45 + densityScore * 0.25 + spreadScore * 0.15 + sourceScore * 0.07))
        : Math.min(0.59, 0.25 + densityScore * 0.2 + spreadScore * 0.1);

      return {
        weekday: bucket.weekday,
        start_hhmm: bucket.start_hhmm,
        duration_min: 60,
        trigger: normalizeFrictionCategory(dominantTrigger(bucket)),
        confidence: Number(confidence.toFixed(2)),
        sample_size: bucket.sampleSize,
        distinct_dates: distinctDates,
      };
    })
    .filter((window) => window.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence || b.sample_size - a.sample_size)
    .slice(0, 3);

  return {
    windows,
    helped_strategies: [],
    red_flag_at: null,
    ed_caution: false,
    computed_at: now.toISOString(),
    model: 'deterministic-v1',
  };
}

export async function computeRiskFingerprintForUser(
  admin: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<RiskFingerprint> {
  const since = sinceIso(now, LOOKBACK_DAYS);
  const events: RiskEvent[] = [];

  const [sosRes, chatRes, taskRes, interventionsRes] = await Promise.all([
    admin
      .from('guardian_sos_events')
      .select('created_at, trigger, red_flag')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('ai_interactions')
      .select('created_at, content, role')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(120),
    admin
      .from('journey_task_executions')
      .select('created_at, outcome')
      .eq('user_id', userId)
      .gte('created_at', since)
      .neq('outcome', 'completed')
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('almog_interventions')
      .select('strategy_type, outcome')
      .eq('user_id', userId)
      .in('outcome', ['helped', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  let redFlagAt: string | null = null;
  for (const row of (sosRes.data ?? []) as Array<{
    created_at?: string;
    trigger?: string | null;
    red_flag?: boolean | null;
  }>) {
    if (!row.created_at) continue;
    if (row.red_flag && !redFlagAt) redFlagAt = row.created_at;
    if (!row.red_flag) {
      events.push({ createdAt: row.created_at, trigger: row.trigger ?? 'emotional', source: 'sos' });
    }
  }

  for (const row of (chatRes.data ?? []) as Array<{ created_at?: string; content?: string | null }>) {
    if (row.created_at && row.content && detectRelapseInMessage(row.content)) {
      events.push({ createdAt: row.created_at, trigger: 'emotional', source: 'relapse_chat' });
    }
  }

  for (const row of (taskRes.data ?? []) as Array<{ created_at?: string }>) {
    if (row.created_at) {
      events.push({ createdAt: row.created_at, trigger: 'motivational', source: 'missed_task' });
    }
  }

  const fingerprint = buildRiskFingerprintFromEvents(events, now);
  fingerprint.red_flag_at = redFlagAt;
  fingerprint.ed_caution = Boolean(redFlagAt);
  fingerprint.helped_strategies = Array.from(
    new Set(
      ((interventionsRes.data ?? []) as Array<{ strategy_type?: string | null }>)
        .map((row) => normalizeStrategyType(row.strategy_type))
        .slice(0, 5)
    )
  );

  if (fingerprint.red_flag_at || fingerprint.ed_caution) {
    fingerprint.windows = [];
  }

  return fingerprint;
}

export async function persistRiskFingerprint(
  admin: SupabaseClient,
  userId: string,
  fingerprint: RiskFingerprint
): Promise<void> {
  const { data: existing } = await admin
    .from('user_memory_dossier')
    .select('risk_signals')
    .eq('user_id', userId)
    .maybeSingle();

  const currentRisk =
    existing && typeof existing === 'object' && existing.risk_signals && typeof existing.risk_signals === 'object'
      ? (existing.risk_signals as Record<string, unknown>)
      : {};

  const riskSignals = {
    ...currentRisk,
    ...fingerprint,
  };

  const { error } = await admin.from('user_memory_dossier').upsert({
    user_id: userId,
    risk_signals: riskSignals,
  });
  if (error) throw new Error(error.message);
}
