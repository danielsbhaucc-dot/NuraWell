/**
 * Difficulty ladder — pure rules (no IO). Level 0 = the original task, negative = easier,
 * positive = harder. `floorLevel` is the easiest level that is still meaningful.
 */
export type LadderLevel = { level: number; title: string; times_per_day: number | null };

export type TaskDefinitionLike = {
  title: string;
  times_per_day: number | null;
  ladder: unknown;
  floor_level: number;
  max_level: number;
};

/** Consecutive successful days at the current level before Almog suggests stepping up. */
export const STEP_UP_AFTER_SUCCESS_DAYS = 10;
/** Success day = at least this share of the level's daily target completed. */
export const SUCCESS_DAY_RATIO = 1;

function isLevel(x: unknown): x is LadderLevel {
  return !!x && typeof x === 'object' && typeof (x as LadderLevel).level === 'number' && typeof (x as LadderLevel).title === 'string';
}

/**
 * Explicit ladder when defined; otherwise a default derived from times_per_day
 * (e.g. 3/day → 2/day → 1/day). Single-shot tasks get no easier level by default
 * (the AI proposes a custom easier variant when the user says it's hard).
 */
export function resolveLadder(def: TaskDefinitionLike): LadderLevel[] {
  const explicit = Array.isArray(def.ladder) ? def.ladder.filter(isLevel) : [];
  if (explicit.length) return [...explicit].sort((a, b) => a.level - b.level);
  const base: LadderLevel = { level: 0, title: def.title, times_per_day: def.times_per_day };
  const n = def.times_per_day ?? 1;
  const out: LadderLevel[] = [base];
  for (let k = 1; n - k >= 1 && -k >= def.floor_level; k++) {
    out.unshift({ level: -k, title: `${def.title} — ${n - k} ${n - k === 1 ? 'פעם' : 'פעמים'} ביום`, times_per_day: n - k });
  }
  return out;
}

export function levelInfo(def: TaskDefinitionLike, level: number): LadderLevel {
  const ladder = resolveLadder(def);
  return ladder.find((l) => l.level === level) ?? ladder.find((l) => l.level === 0) ?? ladder[0];
}

export type LevelChange =
  | { ok: true; from: number; to: number; level: LadderLevel }
  | { ok: false; reason: 'at_floor' | 'at_max' | 'no_level_defined' };

/** "קשה לי" / "גם זה קשה לי" — one step easier, never below the floor. */
export function stepDown(def: TaskDefinitionLike, current: number): LevelChange {
  const ladder = resolveLadder(def);
  const floor = Math.max(def.floor_level, ladder[0]?.level ?? 0);
  if (current <= floor) return { ok: false, reason: 'at_floor' };
  const next = [...ladder].reverse().find((l) => l.level < current && l.level >= floor);
  if (!next) return { ok: false, reason: 'no_level_defined' };
  return { ok: true, from: current, to: next.level, level: next };
}

/** "קל לי" or earned step-up — one step harder, never above max_level. */
export function stepUp(def: TaskDefinitionLike, current: number): LevelChange {
  const ladder = resolveLadder(def);
  const max = Math.min(def.max_level, ladder[ladder.length - 1]?.level ?? 0);
  if (current >= max) return { ok: false, reason: 'at_max' };
  const next = ladder.find((l) => l.level > current && l.level <= max);
  if (!next) return { ok: false, reason: 'no_level_defined' };
  return { ok: true, from: current, to: next.level, level: next };
}

/**
 * Almog's monitoring rule: after a step-down, step back up toward the original (level 0) once
 * the user succeeded STEP_UP_AFTER_SUCCESS_DAYS consecutive days at the current level.
 * Never auto-steps above the original level (harder levels are user-requested only).
 */
export function shouldAutoStepUp(params: {
  currentLevel: number;
  /** distinct success date_keys at the current level since the last level change, newest first */
  successDaysSinceChange: string[];
  todayKey: string;
}): boolean {
  if (params.currentLevel >= 0) return false;
  return consecutiveDays(params.successDaysSinceChange, params.todayKey) >= STEP_UP_AFTER_SUCCESS_DAYS;
}

/** Consecutive days ending today or yesterday (YYYY-MM-DD keys). */
export function consecutiveDays(dateKeys: string[], todayKey: string): number {
  const set = new Set(dateKeys);
  const dayMs = 86_400_000;
  const t = Date.parse(`${todayKey}T00:00:00Z`);
  let cursor = set.has(todayKey) ? t : t - dayMs;
  let n = 0;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    n++;
    cursor -= dayMs;
  }
  return n;
}

/** Missed days (no done/partial, ≥1 missed) in the recent window that make Almog step down on his own. */
export const STEP_DOWN_AFTER_MISSED_DAYS = 3;
export const STEP_DOWN_WINDOW_DAYS = 5;

/**
 * Almog's autonomous step-down: struggling (≥3 missed days out of the last 5, no success day in
 * between) at a level above the floor → one level easier. Not twice within the window.
 */
export function shouldAutoStepDown(params: {
  missedDays: string[];
  successDays: string[];
  todayKey: string;
  lastLevelChangeKey: string | null;
}): boolean {
  const dayMs = 86_400_000;
  const t = Date.parse(`${params.todayKey}T00:00:00Z`);
  const windowStart = new Date(t - (STEP_DOWN_WINDOW_DAYS - 1) * dayMs).toISOString().slice(0, 10);
  if (params.lastLevelChangeKey && params.lastLevelChangeKey >= windowStart) return false;
  const success = new Set(params.successDays.filter((d) => d >= windowStart));
  const missed = new Set(params.missedDays.filter((d) => d >= windowStart && !success.has(d)));
  return success.size === 0 && missed.size >= STEP_DOWN_AFTER_MISSED_DAYS;
}
