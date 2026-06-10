import type { DossierExtractionPatch, UserMemoryDossier } from './types';
import { EMPTY_DOSSIER } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const INSIGHT_KEEP_LIMIT = 24;
const INSIGHT_HALF_LIFE_DAYS = 90;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function normalizeInsightText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function insightScore(item: UserMemoryDossier['inferred_insights'][number], now: Date): number {
  const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.7;
  const t = item.created_at ? new Date(item.created_at).getTime() : NaN;
  const ageDays = Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / DAY_MS) : 30;
  const recency = Math.pow(0.5, ageDays / INSIGHT_HALF_LIFE_DAYS);
  return confidence * 0.7 + recency * 0.3;
}

function mergeObjectSection(
  current: Record<string, unknown>,
  patch: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!patch || !isPlainObject(patch)) return current;
  const out = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value;
    } else if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeObjectSection(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mergeTags(current: string[], add: string[] | undefined, remove: string[] | undefined): string[] {
  const set = new Set(current.map((t) => t.trim()).filter(Boolean));
  for (const r of remove ?? []) {
    set.delete(r.trim());
  }
  for (const a of add ?? []) {
    const clean = a.trim();
    if (clean.length >= 2) set.add(clean);
  }
  return [...set].slice(0, 40);
}

function mergeInsights(
  current: UserMemoryDossier['inferred_insights'],
  incoming: DossierExtractionPatch['inferred_insights']
): UserMemoryDossier['inferred_insights'] {
  if (!incoming?.length) return current;
  const out = [...current];
  for (const item of incoming) {
    if (!item?.text?.trim()) continue;
    const text = item.text.replace(/\s+/g, ' ').trim();
    const key = normalizeInsightText(text);
    if (out.some((x) => normalizeInsightText(x.text) === key)) continue;
    if (item.supersedes) {
      const supersedesKey = normalizeInsightText(item.supersedes);
      const idx = out.findIndex((x) => normalizeInsightText(x.text) === supersedesKey);
      if (idx >= 0) out.splice(idx, 1);
    }
    out.push({
      ...item,
      text,
      created_at: item.created_at ?? new Date().toISOString(),
    });
  }
  const now = new Date();
  return out
    .sort((a, b) => insightScore(b, now) - insightScore(a, now))
    .slice(0, INSIGHT_KEEP_LIMIT)
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
}

export function mergeDossierPatch(
  existing: UserMemoryDossier | null,
  userId: string,
  patch: DossierExtractionPatch
): UserMemoryDossier {
  const base = existing ?? { user_id: userId, ...EMPTY_DOSSIER() };

  return {
    ...base,
    tags: mergeTags(base.tags, patch.tags_add, patch.tags_remove),
    essentials: mergeObjectSection(base.essentials, patch.essentials),
    goals: mergeObjectSection(base.goals, patch.goals),
    task_memory: mergeObjectSection(base.task_memory, patch.task_memory),
    habit_memory: mergeObjectSection(base.habit_memory, patch.habit_memory),
    schedule_memory: mergeObjectSection(base.schedule_memory, patch.schedule_memory),
    personal_context: mergeObjectSection(base.personal_context, patch.personal_context),
    health_context: mergeObjectSection(base.health_context, patch.health_context),
    psychology: mergeObjectSection(base.psychology, patch.psychology),
    coaching_profile: mergeObjectSection(base.coaching_profile, patch.coaching_profile),
    risk_signals: mergeObjectSection(base.risk_signals, patch.risk_signals),
    inferred_insights: mergeInsights(base.inferred_insights, patch.inferred_insights),
    source_stats: mergeObjectSection(base.source_stats, {
      last_extraction_at: new Date().toISOString(),
      extraction_count:
        (typeof base.source_stats.extraction_count === 'number'
          ? base.source_stats.extraction_count
          : 0) + 1,
    }),
  };
}
