import { createHealthMemoryGate } from '@/lib/module-api/privacy-retention/lib-privacy-health-memory';
import { sealTableRow } from '@/lib/crypto/pii-seal';
import { decTableResult } from '@/lib/crypto/pii-fields';
import { decInteractionResult } from '@/lib/crypto/pii-fields';
/**
 * 🌙 Nightly behaviour-pattern insights batch (runs inside /api/v1/ai/cron/memory-pipeline full run).
 *
 * Per user active in the last 28 days:
 *  1. gather dated events (task done/missed, SOS presses, user chat lines) — Israel time
 *  2. deterministic candidates (detect.ts) + one cheap LLM call to phrase/confirm and read
 *     food/mood themes from the chat (only when there was new activity in the last 36h)
 *  3. upsert into user_insights (dedupe_key "pattern:<key>", metadata.kind = "pattern") with
 *     evidence dates, first_seen / last_confirmed / expires_at (21 days after last confirmation)
 *  4. expire stale patterns, deprecate placeholder-corrupted insights
 *  5. proactive plan: the day before / the morning of a hard weekday (or once for a new
 *     daypart/food pattern) queue a confirm-card proposal in chat — never added to the plan directly
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { queueTaskProposals } from '../../chat-ui/task-proposals';
import { titlesAreSimilar } from '@/lib/module-api/reminders/lib-ai-almog-commitments-title-similarity';
import { hasPlaceholderCorruption } from '../../safety/memory-text-guard';
import { INSIGHT_STATUS } from '../status';
import { detectNotableChanges } from './detect-changes';
import { daysUntilWeekday, detectPatternCandidates, israelParts, type BehaviourEvent } from './detect';
import { phrasePatterns, type PatternInsight } from './llm';

const WINDOW_DAYS = 28;
const EXPIRE_DAYS = 21;
const DAY = 86_400_000;

export type PatternMeta = {
  kind: 'pattern';
  key: string;
  theme: string;
  user_line: string;
  tip: string;
  plan_title: string;
  evidence_dates: string[];
  weekday: number | null;
  daypart: string | null;
  first_seen: string;
  last_confirmed: string;
  expires_at: string;
  proposal_queued_for?: string;
};

type ExistingRow = { id: string; dedupe_key: string; insight_text: string; mention_count: number; status: string; metadata: PatternMeta | null };

export type PatternBatchResult = {
  users: number;
  llm_calls: number;
  upserted: number;
  expired: number;
  repaired: number;
  proposals: number;
  errors: number;
};

async function activeUserIds(admin: SupabaseClient, sinceIso: string, limit: number): Promise<string[]> {
  const [chat, tasks, sos] = await Promise.all([
    admin.from('ai_interactions').select('user_id').eq('role', 'user').gte('created_at', sinceIso).limit(5000),
    admin.from('task_events').select('user_id').gte('occurred_at', sinceIso).limit(5000),
    admin.from('guardian_sos_events').select('user_id').gte('created_at', sinceIso).limit(5000),
  ]);
  const ids = [...(chat.data ?? []), ...(tasks.data ?? []), ...(sos.data ?? [])].map((r) => r.user_id as string);
  return [...new Set(ids)].slice(0, limit);
}

async function gatherEvents(admin: SupabaseClient, userId: string, sinceIso: string) {
  const [tasks, sos, chat, prof] = await Promise.all([
    admin.from('task_events').select('kind, occurred_at, definition_id').eq('user_id', userId).in('kind', ['done', 'missed', 'partial']).gte('occurred_at', sinceIso).limit(500),
    admin.from('guardian_sos_events').select('created_at, trigger').eq('user_id', userId).gte('created_at', sinceIso).limit(200),
    admin.from('ai_interactions').select('created_at, content').eq('user_id', userId).eq('role', 'user').gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(150).then(decInteractionResult(userId)),
    admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ]);
  const events: BehaviourEvent[] = [
    ...((tasks.data ?? []) as Array<{ kind: string; occurred_at: string }>).map((t) => ({
      at: t.occurred_at,
      kind: (t.kind === 'done' ? 'done' : 'missed') as BehaviourEvent['kind'],
    })),
    ...((sos.data ?? []) as Array<{ created_at: string; trigger: string | null }>).map((s) => ({ at: s.created_at, kind: 'sos' as const, label: s.trigger })),
  ];
  const chatRows = (chat.data ?? []) as Array<{ created_at: string; content: string }>;
  const digest = chatRows
    .map((r) => {
      const p = israelParts(r.created_at);
      const hh = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.created_at));
      return `[${p.dateKey} ${hh}] ${String(r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)}`;
    })
    .join('\n');
  const allowedDates = new Set<string>([...events.map((e) => israelParts(e.at).dateKey), ...chatRows.map((r) => israelParts(r.created_at).dateKey)]);
  const lastActivityMs = Math.max(0, ...events.map((e) => Date.parse(e.at)), ...chatRows.map((r) => Date.parse(r.created_at)));
  const firstName = ((prof.data?.full_name as string | null) ?? '').trim().split(/\s+/)[0] || '';
  return { events, digest, allowedDates, lastActivityMs, firstName };
}

function metaFor(p: PatternInsight, prev: PatternMeta | null, nowIso: string, now: Date): PatternMeta {
  return {
    kind: 'pattern',
    key: p.key,
    theme: p.theme,
    user_line: p.user_line_he,
    tip: p.tip_he,
    plan_title: p.plan_title_he ?? '',
    evidence_dates: [...new Set([...(prev?.evidence_dates ?? []), ...p.evidence_dates])].sort().slice(-12),
    weekday: p.weekday ?? null,
    daypart: p.daypart ?? null,
    first_seen: prev?.first_seen ?? nowIso,
    last_confirmed: nowIso,
    expires_at: new Date(now.getTime() + EXPIRE_DAYS * DAY).toISOString(),
    proposal_queued_for: prev?.proposal_queued_for,
  };
}

/** Pure: should we offer the plan card today for this pattern? Returns the target date key or null. */
export function proposalTargetFor(meta: PatternMeta, now: Date): string | null {
  if (!meta.plan_title) return null;
  const today = israelParts(now.toISOString()).dateKey;
  if (meta.weekday != null) {
    const d = daysUntilWeekday(meta.weekday, now);
    if (d !== 1 && d !== 0) return null; // the evening before / that morning only
    const target = israelParts(new Date(now.getTime() + d * DAY).toISOString()).dateKey;
    return meta.proposal_queued_for === target ? null : target;
  }
  // daypart / food themes: once when first found, then at most every 14 days while still confirmed
  const last = meta.proposal_queued_for ? Date.parse(`${meta.proposal_queued_for}T12:00:00Z`) : 0;
  if (last && now.getTime() - last < 14 * DAY) return null;
  return today;
}

async function recentlyDeclined(admin: SupabaseClient, userId: string, title: string, now: Date): Promise<boolean> {
  const { data } = await admin
    .from('chat_task_proposals')
    .select('title, status, resolved_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(now.getTime() - 21 * DAY).toISOString())
    .limit(30);
  return ((data ?? []) as Array<{ title: string; status: string }>).some(
    // confirmed → already in the plan; dismissed → user said no. Either way don't ask again for 21 days.
    (r) => (r.status === 'confirmed' || r.status === 'dismissed') && titlesAreSimilar(r.title, title, 0.72)
  );
}

export async function runPatternInsightsBatch(
  admin: SupabaseClient,
  opts: { limit?: number; now?: Date; budgetMs?: number; userIds?: string[] } = {}
): Promise<PatternBatchResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const deadline = Date.now() + (opts.budgetMs ?? 150_000);
  const sinceIso = new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString();
  const res: PatternBatchResult = { users: 0, llm_calls: 0, upserted: 0, expired: 0, repaired: 0, proposals: 0, errors: 0 };

  // repair: anonymiser placeholders make an insight meaningless → deprecate (row kept for audit)
  const { data: activeAll } = await admin.from('user_insights').select('id, user_id, insight_text, metadata').eq('status', INSIGHT_STATUS.ACTIVE).limit(2000).then(decTableResult('user_insights'));
  for (const r of (activeAll ?? []) as Array<{ id: string; insight_text: string; metadata: Record<string, unknown> | null }>) {
    if (!hasPlaceholderCorruption(r.insight_text)) continue;
    const { error } = await admin
      .from('user_insights')
      .update({ status: INSIGHT_STATUS.DEPRECATED, is_active: false, metadata: { ...(r.metadata ?? {}), deprecated_reason: 'placeholder_corruption', deprecated_at: nowIso } })
      .eq('id', r.id);
    if (!error) res.repaired += 1;
  }

  // expire: patterns that were not re-confirmed for EXPIRE_DAYS
  const { data: patternRows } = await admin.from('user_insights').select('id, metadata').like('dedupe_key', 'pattern:%').eq('status', INSIGHT_STATUS.ACTIVE).limit(2000);
  for (const r of (patternRows ?? []) as Array<{ id: string; metadata: PatternMeta | null }>) {
    if (r.metadata?.expires_at && Date.parse(r.metadata.expires_at) < now.getTime()) {
      const { error } = await admin.from('user_insights').update({ status: INSIGHT_STATUS.DEPRECATED, is_active: false }).eq('id', r.id);
      if (!error) res.expired += 1;
    }
  }

  const userIds = opts.userIds ?? (await activeUserIds(admin, sinceIso, opts.limit ?? 60));
  for (const userId of userIds) {
    if (Date.now() > deadline) break;
    res.users += 1;
    try {
      const { data: existingData } = await admin
        .from('user_insights')
        .select('id, dedupe_key, insight_text, mention_count, status, metadata')
        .eq('user_id', userId)
        .like('dedupe_key', 'pattern:%').then(decTableResult('user_insights', userId));
      const existing = (existingData ?? []) as ExistingRow[];
      const g = await gatherEvents(admin, userId, sinceIso);

      // LLM only when something new happened (cheap: idle users cost nothing)
      if (now.getTime() - g.lastActivityMs < 36 * 3_600_000) {
        const candidates = detectPatternCandidates(g.events);
        res.llm_calls += 1;
        const patterns = await phrasePatterns({
          firstName: g.firstName,
          candidates,
          digest: g.digest,
          existing: existing.filter((e) => e.status === INSIGHT_STATUS.ACTIVE).map((e) => ({ key: e.dedupe_key.slice('pattern:'.length), insight: e.insight_text })),
          allowedDates: g.allowedDates,
        });
        const dropHealth = createHealthMemoryGate(userId);
        for (const p of patterns) {
          if (await dropHealth(p.category, p.insight_he)) continue;
          const key = `pattern:${p.key}`;
          const prev = existing.find((e) => e.dedupe_key === key) ?? null;
          const meta = metaFor(p, prev?.metadata ?? null, nowIso, now);
          const row = {
            user_id: userId,
            category: p.category,
            insight_text: p.insight_he,
            actionability_score: 8,
            confidence: p.confidence,
            is_active: true,
            status: INSIGHT_STATUS.ACTIVE,
            dedupe_key: key,
            mention_count: (prev?.mention_count ?? 0) + 1,
            last_seen_at: nowIso,
            metadata: meta,
          };
          const { error } = await admin.from('user_insights').upsert(await sealTableRow('user_insights', row, userId), { onConflict: 'user_id,dedupe_key' });
          if (error) res.errors += 1;
          else res.upserted += 1;
        }
      }

      // notable changes: deterministic ($0), stored as change:<kind> (one live row per kind, read only if seen ≤7d)
      for (const c of detectNotableChanges(g.events, now)) {
        const row = {
          user_id: userId,
          category: 'blocker',
          insight_text: c.summaryHe,
          actionability_score: 7 + c.risk,
          confidence: 0.9,
          is_active: true,
          status: INSIGHT_STATUS.ACTIVE,
          dedupe_key: `change:${c.kind}`,
          last_seen_at: nowIso,
          metadata: { kind: 'notable_change', change_kind: c.kind, date: c.dateKey, risk: c.risk },
        };
        const { error } = await admin.from('user_insights').upsert(await sealTableRow('user_insights', row, userId), { onConflict: 'user_id,dedupe_key' });
        if (error) res.errors += 1;
        else res.upserted += 1;
      }

      // proactive plan card
      const { data: fresh } = await admin
        .from('user_insights')
        .select('id, metadata, confidence')
        .eq('user_id', userId)
        .eq('status', INSIGHT_STATUS.ACTIVE)
        .like('dedupe_key', 'pattern:%');
      for (const r of (fresh ?? []) as Array<{ id: string; metadata: PatternMeta; confidence: number }>) {
        const target = proposalTargetFor(r.metadata, now);
        if (!target) continue;
        if (await recentlyDeclined(admin, userId, r.metadata.plan_title, now)) continue;
        const queued = await queueTaskProposals(admin, {
          userId,
          sessionId: null,
          tasks: [{ title: r.metadata.plan_title, reason: `${r.metadata.user_line} ${r.metadata.tip}`.slice(0, 280), confidence: r.confidence }],
          planTitles: [],
        });
        await admin.from('user_insights').update({ metadata: { ...r.metadata, proposal_queued_for: target } }).eq('id', r.id);
        res.proposals += queued;
      }
    } catch (e) {
      res.errors += 1;
      console.warn('[insight-patterns] user failed', { userId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return res;
}
