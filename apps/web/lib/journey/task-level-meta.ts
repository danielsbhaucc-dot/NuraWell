/**
 * task-level-meta.ts
 * ------------------
 * קריאה/כתיבה של task_level_meta ב-journey_progress (JSONB).
 */

import type { JourneyTaskLevelMeta, TaskDifficultyFeedback } from '../types/journey';

export function parseTaskLevelMeta(
  raw: unknown,
  taskId: string
): JourneyTaskLevelMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = (raw as Record<string, unknown>)[taskId];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const m = row as Record<string, unknown>;

  const currentLevelId = typeof m.current_level_id === 'string' ? m.current_level_id : null;
  if (!currentLevelId) return null;

  const feedbackRaw = m.last_feedback;
  const lastFeedback: TaskDifficultyFeedback | null =
    feedbackRaw === 'too_easy' || feedbackRaw === 'ok' || feedbackRaw === 'too_hard'
      ? feedbackRaw
      : null;

  return {
    current_level_id: currentLevelId,
    recommended_level_id:
      typeof m.recommended_level_id === 'string' ? m.recommended_level_id : null,
    started_level_id: typeof m.started_level_id === 'string' ? m.started_level_id : null,
    current_level_started_at:
      typeof m.current_level_started_at === 'string'
        ? m.current_level_started_at
        : new Date().toISOString(),
    last_feedback: lastFeedback,
    last_feedback_at: typeof m.last_feedback_at === 'string' ? m.last_feedback_at : null,
    success_streak_current_level:
      typeof m.success_streak_current_level === 'number' && m.success_streak_current_level >= 0
        ? Math.floor(m.success_streak_current_level)
        : 0,
    success_days_current_level:
      typeof m.success_days_current_level === 'number' && m.success_days_current_level >= 0
        ? Math.floor(m.success_days_current_level)
        : 0,
    best_level_id: typeof m.best_level_id === 'string' ? m.best_level_id : null,
    reached_recommended_at:
      typeof m.reached_recommended_at === 'string' ? m.reached_recommended_at : null,
    recommended_streak_current:
      typeof m.recommended_streak_current === 'number' && m.recommended_streak_current >= 0
        ? Math.floor(m.recommended_streak_current)
        : 0,
    recommended_streak_best:
      typeof m.recommended_streak_best === 'number' && m.recommended_streak_best >= 0
        ? Math.floor(m.recommended_streak_best)
        : 0,
    level_up_suggested_at:
      typeof m.level_up_suggested_at === 'string' ? m.level_up_suggested_at : null,
    level_up_declined_at:
      typeof m.level_up_declined_at === 'string' ? m.level_up_declined_at : null,
  };
}

export function applyTaskLevelMetaPatch(
  existingMeta: unknown,
  taskId: string,
  patch: Partial<JourneyTaskLevelMeta>
): Record<string, JourneyTaskLevelMeta> {
  const base =
    existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta)
      ? (existingMeta as Record<string, unknown>)
      : {};

  const out: Record<string, JourneyTaskLevelMeta> = {};
  for (const k of Object.keys(base)) {
    if (k === taskId) continue;
    const parsed = parseTaskLevelMeta(existingMeta, k);
    if (parsed) out[k] = parsed;
  }

  const prev = parseTaskLevelMeta(existingMeta, taskId);
  const next: JourneyTaskLevelMeta = {
    current_level_id: patch.current_level_id ?? prev?.current_level_id ?? '',
    recommended_level_id:
      patch.recommended_level_id !== undefined
        ? patch.recommended_level_id
        : (prev?.recommended_level_id ?? null),
    started_level_id:
      patch.started_level_id !== undefined
        ? patch.started_level_id
        : (prev?.started_level_id ?? null),
    current_level_started_at:
      patch.current_level_started_at ??
      prev?.current_level_started_at ??
      new Date().toISOString(),
    last_feedback:
      patch.last_feedback !== undefined ? patch.last_feedback : (prev?.last_feedback ?? null),
    last_feedback_at:
      patch.last_feedback_at !== undefined ? patch.last_feedback_at : (prev?.last_feedback_at ?? null),
    success_streak_current_level:
      patch.success_streak_current_level ?? prev?.success_streak_current_level ?? 0,
    success_days_current_level:
      patch.success_days_current_level ?? prev?.success_days_current_level ?? 0,
    best_level_id:
      patch.best_level_id !== undefined ? patch.best_level_id : (prev?.best_level_id ?? null),
    reached_recommended_at:
      patch.reached_recommended_at !== undefined
        ? patch.reached_recommended_at
        : (prev?.reached_recommended_at ?? null),
    recommended_streak_current:
      patch.recommended_streak_current ?? prev?.recommended_streak_current ?? 0,
    recommended_streak_best:
      patch.recommended_streak_best ?? prev?.recommended_streak_best ?? 0,
    level_up_suggested_at:
      patch.level_up_suggested_at !== undefined
        ? patch.level_up_suggested_at
        : (prev?.level_up_suggested_at ?? null),
    level_up_declined_at:
      patch.level_up_declined_at !== undefined
        ? patch.level_up_declined_at
        : (prev?.level_up_declined_at ?? null),
  };

  out[taskId] = next;
  return out;
}

/** אתחול meta למשימה עם leveling — רמה התחלה לפי start_level_id */
export function initTaskLevelMeta(
  startLevelId: string,
  recommendedLevelId: string | null
): JourneyTaskLevelMeta {
  const now = new Date().toISOString();
  return {
    current_level_id: startLevelId,
    recommended_level_id: recommendedLevelId,
    started_level_id: startLevelId,
    current_level_started_at: now,
    last_feedback: null,
    last_feedback_at: null,
    success_streak_current_level: 0,
    success_days_current_level: 0,
    best_level_id: startLevelId,
    reached_recommended_at: null,
    recommended_streak_current: 0,
    recommended_streak_best: 0,
    level_up_suggested_at: null,
    level_up_declined_at: null,
  };
}

export function getLevelOrder(
  levels: Array<{ id: string; order: number }>,
  levelId: string | null | undefined
): number {
  if (!levelId) return -1;
  const found = levels.find((l) => l.id === levelId);
  return found?.order ?? -1;
}

export function getNextLevelId(
  levels: Array<{ id: string; order: number }>,
  currentLevelId: string
): string | null {
  const sorted = [...levels].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === currentLevelId);
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1]!.id;
}

export function getPreviousLevelId(
  levels: Array<{ id: string; order: number }>,
  currentLevelId: string
): string | null {
  const sorted = [...levels].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === currentLevelId);
  if (idx <= 0) return null;
  return sorted[idx - 1]!.id;
}
