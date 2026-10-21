/**
 * Notification quality learning loop.
 *  1. every lint fix / rejection / LLM edit is logged anonymized (first name → [NAME], PII patterns → [PII],
 *     no user_id) to notify_quality_events;
 *  2. nightly (from the quality sweep) recurring mistakes are condensed by a cheap model into a short,
 *     capped, versioned "avoid X → say Y" list (notify_style_rules), only rules seen ≥ 2 times;
 *  3. active rules are injected into every notification generation prompt;
 *  4. frequent literal rules (hits ≥ AUTO_FIX_MIN_HITS) become deterministic replacements automatically
 *     unless Daniel reviewed the rule in Ops.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyPiiDetectors } from '@/lib/ai/privacy/pii-patterns';
import { meteredFetch } from '@/lib/ai/usage-meter';
import { REPLY_QC_MODEL } from '@/lib/ai/reply-quality/core';
import { maskName } from './notify-qc';

export type NotifyQualityStage = 'lint_fix' | 'lint_reject' | 'qc_edit' | 'qc_reject' | 'sweep_fix';
export type NotifyQualityEvent = {
  stage: NotifyQualityStage;
  category: string;
  source?: string | null;
  before: string;
  after?: string | null;
};
export type StyleRule = { id: number; avoid: string; prefer: string; category: string; hits: number; active: boolean; auto_fix: boolean };

export const STYLE_RULES_CAP = 12;
export const STYLE_RULE_MIN_HITS = 2;
export const AUTO_FIX_MIN_HITS = 4;
export const LEARN_FEATURE = 'almog_notify_learn';

export function anonymizeNotifyText(text: string, firstName?: string | null): string {
  const masked = maskName(text ?? '', firstName);
  return applyPiiDetectors(masked, () => '[PII]').slice(0, 400);
}

/** "phrasing: wrong name in greeting: X; slash gender form" → "wrong_name" (first issue, no free text) */
export function categoryFromReason(reason: string): string {
  const r = reason.replace(/^phrasing:\s*/, '').split(';')[0]!.split(':')[0]!.trim().toLowerCase();
  if (/wrong name/.test(r)) return 'wrong_name';
  if (/slash/.test(r)) return 'slash_form';
  if (/banned/.test(r)) return 'banned_word';
  if (/slang/.test(r)) return 'gender_slang';
  if (/unnatural/.test(r)) return 'unnatural_phrase';
  if (/greeting/.test(r)) return 'repeated_greeting';
  if (/truncat|too short|json|foreign|latin|not hebrew|leak|repetition|garbled|placeholder|incoming/.test(r)) return 'structure';
  return r.replace(/[^a-z_]+/g, '_').slice(0, 40) || 'other';
}

let adminPromise: Promise<SupabaseClient | null> | null = null;
async function lazyAdmin(): Promise<SupabaseClient | null> {
  adminPromise ??= import('@/lib/supabase/admin')
    .then((m) => m.createAdminClient() as SupabaseClient)
    .catch(() => null);
  return adminPromise;
}

/** fire-and-forget; never throws */
export async function logNotifyQualityEvents(
  events: NotifyQualityEvent[],
  opts: { firstName?: string | null; admin?: SupabaseClient | null } = {}
): Promise<void> {
  if (!events.length) return;
  try {
    const admin = opts.admin ?? (await lazyAdmin());
    if (!admin) return;
    await admin.from('notify_quality_events').insert(
      events.map((e) => ({
        stage: e.stage,
        category: e.category.slice(0, 40),
        source: e.source?.slice(0, 60) ?? null,
        before_text: anonymizeNotifyText(e.before, opts.firstName),
        after_text: e.after == null ? null : anonymizeNotifyText(e.after, opts.firstName),
      }))
    );
  } catch {
    /* logging must never break generation */
  }
}

let rulesCache: { at: number; rules: StyleRule[] } | null = null;
export function _resetStyleRulesCache() {
  rulesCache = null;
}

export async function loadActiveStyleRules(admin?: SupabaseClient | null): Promise<StyleRule[]> {
  if (rulesCache && Date.now() - rulesCache.at < 10 * 60_000) return rulesCache.rules;
  try {
    const db = admin ?? (await lazyAdmin());
    if (!db) return [];
    const { data } = await db
      .from('notify_style_rules')
      .select('id, avoid, prefer, category, hits, active, auto_fix')
      .eq('active', true)
      .eq('deleted', false)
      .order('hits', { ascending: false })
      .limit(STYLE_RULES_CAP);
    rulesCache = { at: Date.now(), rules: (data ?? []) as StyleRule[] };
    return rulesCache.rules;
  } catch {
    return [];
  }
}

export function styleRulesPromptBlock(rules: StyleRule[]): string | null {
  const list = rules.slice(0, STYLE_RULES_CAP).filter((r) => r.avoid.trim());
  if (!list.length) return null;
  return [
    'טעויות ניסוח שחזרו בהתראות קודמות — אל תחזור עליהן:',
    ...list.map((r) => (r.prefer.trim() ? `- לא "${r.avoid}" → כן "${r.prefer}"` : `- לא "${r.avoid}"`)),
  ].join('\n');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** deterministic replacements for auto_fix rules (whole-phrase, Hebrew word boundaries) */
export function applyAutoFixRules(text: string, rules: StyleRule[]): { text: string; applied: StyleRule[] } {
  let t = text;
  const applied: StyleRule[] = [];
  for (const r of rules) {
    if (!r.auto_fix || !r.prefer.trim() || r.avoid.trim().length < 3) continue;
    const re = new RegExp(`(?<![\\u05D0-\\u05EA])${escapeRe(r.avoid.trim())}(?![\\u05D0-\\u05EA])`, 'gu');
    const next = t.replace(re, r.prefer.trim());
    if (next !== t) {
      t = next;
      applied.push(r);
    }
  }
  return { text: t, applied };
}

export const LEARN_SYSTEM = `You maintain a short style list for Hebrew push notifications written by a warm, casual male coach.
You get anonymized examples of mistakes (BEFORE → AFTER when a correction exists) and the current rules.
Return JSON {"rules":[{"avoid":"<exact Hebrew phrase copied from BEFORE texts>","prefer":"<natural Hebrew replacement, may be empty>","category":"grammar|gender|unnatural|name|other"}]}.
Rules: at most 12; "avoid" must be a short phrase (2-6 words) copied verbatim from at least TWO different BEFORE texts; generic patterns only
(never names, never [NAME], never task-specific content); keep existing good rules; light slang ("וואלה", "יאללה") is NOT a mistake. JSON only.`;

type LearnCandidate = { avoid: string; prefer: string; category: string };

export function parseLearnedRules(raw: string): LearnCandidate[] {
  try {
    const s = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const j = JSON.parse(s) as { rules?: Array<Record<string, unknown>> };
    return (j.rules ?? [])
      .map((r) => ({
        avoid: String(r.avoid ?? '').trim().slice(0, 80),
        prefer: String(r.prefer ?? '').trim().slice(0, 80),
        category: String(r.category ?? 'other').trim().slice(0, 20),
      }))
      .filter((r) => r.avoid.length >= 2 && !/\[NAME\]|\[PII\]/.test(r.avoid + r.prefer) && r.avoid !== r.prefer);
  } catch {
    return [];
  }
}

/** count of distinct BEFORE texts containing the phrase (the ≥2 requirement is enforced here, not trusted to the model) */
export function countHits(avoid: string, befores: string[]): number {
  const set = new Set(befores);
  let n = 0;
  for (const b of set) if (b.includes(avoid)) n += 1;
  return n;
}

export type LearnResult = { samples: number; candidates: number; upserted: number; auto_fix: number; version: number | null; skipped?: string };

/** Nightly: condense the last 14 days of mistakes into the capped rule list. ~1 cheap call/night. */
export async function learnStyleRules(admin: SupabaseClient, opts: { fetchImpl?: typeof fetch } = {}): Promise<LearnResult> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: ev } = await admin
    .from('notify_quality_events')
    .select('stage, category, before_text, after_text')
    .gte('created_at', since)
    .neq('category', 'structure')
    .order('created_at', { ascending: false })
    .limit(400);
  const events = (ev ?? []) as Array<{ stage: string; category: string; before_text: string; after_text: string | null }>;
  const befores = events.map((e) => e.before_text);
  const out: LearnResult = { samples: events.length, candidates: 0, upserted: 0, auto_fix: 0, version: null };
  if (events.length < STYLE_RULE_MIN_HITS) return { ...out, skipped: 'not_enough_events' };

  const { data: existingRows } = await admin.from('notify_style_rules').select('id, avoid, prefer, hits, active, auto_fix, reviewed, deleted');
  const existing = (existingRows ?? []) as Array<{ id: number; avoid: string; prefer: string; hits: number; active: boolean; auto_fix: boolean; reviewed: boolean; deleted: boolean }>;

  let candidates: LearnCandidate[] = [];
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (key) {
    const sample = events.slice(0, 60).map((e, i) => `${i + 1}. [${e.category}] BEFORE: ${e.before_text}${e.after_text ? `\n   AFTER: ${e.after_text}` : ''}`);
    const current = existing.filter((r) => !r.deleted).map((r) => `- avoid "${r.avoid}" → "${r.prefer}"`).join('\n') || '(none)';
    try {
      const f = opts.fetchImpl ?? meteredFetch(fetch, { userId: null, feature: LEARN_FEATURE });
      const res = await f('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: REPLY_QC_MODEL,
          reasoning: { effort: 'minimal', exclude: true },
          temperature: 0,
          max_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: LEARN_SYSTEM },
            { role: 'user', content: `CURRENT RULES:\n${current}\n\nEXAMPLES:\n${sample.join('\n')}` },
          ],
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        candidates = parseLearnedRules(j.choices?.[0]?.message?.content ?? '');
      }
    } catch {
      /* keep the existing list */
    }
  }
  out.candidates = candidates.length;

  let changed = false;
  const byAvoid = new Map(existing.map((r) => [r.avoid, r]));
  // refresh hit counts of existing rules from the real data
  for (const r of existing) {
    if (r.deleted) continue;
    const hits = countHits(r.avoid, befores);
    if (hits !== r.hits) {
      const patch: Record<string, unknown> = { hits, updated_at: new Date().toISOString() };
      if (!r.reviewed && !r.auto_fix && hits >= AUTO_FIX_MIN_HITS && r.prefer.trim() && r.avoid.length >= 3) {
        patch.auto_fix = true;
        out.auto_fix += 1;
      }
      await admin.from('notify_style_rules').update(patch).eq('id', r.id);
      changed = true;
    }
  }
  const activeCount = existing.filter((r) => r.active && !r.deleted).length;
  let room = Math.max(0, STYLE_RULES_CAP - activeCount);
  for (const c of candidates) {
    if (byAvoid.has(c.avoid)) continue; // existing (incl. deleted tombstones) are never re-created
    const hits = countHits(c.avoid, befores);
    if (hits < STYLE_RULE_MIN_HITS || room <= 0) continue;
    const auto = hits >= AUTO_FIX_MIN_HITS && c.prefer.length > 0 && c.avoid.length >= 3;
    const { error } = await admin.from('notify_style_rules').insert({
      avoid: c.avoid,
      prefer: c.prefer,
      category: c.category || 'other',
      hits,
      active: true,
      auto_fix: auto,
    });
    if (!error) {
      out.upserted += 1;
      if (auto) out.auto_fix += 1;
      room -= 1;
      changed = true;
    }
  }
  if (changed) out.version = await bumpStyleRulesVersion(admin);
  // events older than 60 days are not needed for learning or the metrics
  await admin.from('notify_quality_events').delete().lt('created_at', new Date(Date.now() - 60 * 86_400_000).toISOString());
  return out;
}

export async function bumpStyleRulesVersion(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin.from('notify_style_rules_meta').select('version').eq('id', 1).maybeSingle();
  const next = Number((data as { version?: number } | null)?.version ?? 0) + 1;
  await admin.from('notify_style_rules_meta').upsert({ id: 1, version: next, updated_at: new Date().toISOString() });
  rulesCache = null;
  return next;
}
