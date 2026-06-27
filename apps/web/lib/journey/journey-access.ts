import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminUserJourneyReport, AdminUserJourneyStepRow } from '../admin/build-user-journey-report';
import type { MainObstacle, WeakestTimeOfDay } from '../onboarding/types';
import type { JourneyStationGroup } from './group-journey-by-station';
import type { JourneyStepProgress, JourneyStepWithProgress } from '../types/journey';

export type JourneyUnlockSource = 'foundation' | 'adaptive';

export type JourneyAccessContext = {
  foundationStationId: string | null;
  foundationComplete: boolean;
  unlockedStepIds: Set<string>;
  /** צעדי foundation ממוינים (רק published) */
  foundationSteps: AdminUserJourneyStepRow[];
};

type ProfileSignals = {
  main_obstacle: MainObstacle | null;
  main_obstacle_detail: string | null;
  weakest_time_of_day: WeakestTimeOfDay | null;
};

const OBSTACLE_HINTS: Record<MainObstacle, string[]> = {
  no_time: ['זמן', 'מהיר', 'קצר', 'דקות', 'busy'],
  emotional_eating: ['רגש', 'לחץ', 'stress', 'נפש', 'רגשי'],
  lack_of_consistency: ['עקביות', 'הרגל', 'שגרה', 'routine'],
  no_support: ['תמיכה', 'יחד', 'חבר'],
  other: [],
};

const TIME_HINTS: Record<WeakestTimeOfDay, string[]> = {
  morning: ['בוקר', 'morning'],
  noon: ['צהר', 'noon'],
  afternoon: ['אחר הצהר', 'afternoon'],
  evening_night: ['ערב', 'לילה', 'night', 'evening'],
};

export async function loadJourneyAccessContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  userId: string,
  report: AdminUserJourneyReport
): Promise<JourneyAccessContext> {
  const [{ data: foundationRows }, { data: unlockRows }] = await Promise.all([
    supabase
      .from('journey_stations')
      .select('id')
      .eq('is_foundation', true)
      .limit(1),
    supabase.from('user_journey_step_unlocks').select('step_id').eq('user_id', userId),
  ]);

  const foundationStationId =
    Array.isArray(foundationRows) && foundationRows[0]?.id
      ? (foundationRows[0].id as string)
      : null;

  const published = report.steps.filter((s) => s.is_published);
  const foundationSteps = foundationStationId
    ? published
        .filter((s) => s.station_id === foundationStationId)
        .sort((a, b) => a.step_number - b.step_number)
    : [];

  const foundationComplete =
    foundationSteps.length === 0
      ? true
      : foundationSteps.every((s) => s.is_completed);

  const unlockedStepIds = new Set<string>(
    (unlockRows ?? []).map((r: { step_id: string }) => r.step_id)
  );

  return {
    foundationStationId,
    foundationComplete,
    unlockedStepIds,
    foundationSteps,
  };
}

function foundationActiveIndex(
  foundationSteps: AdminUserJourneyStepRow[]
): number {
  const idx = foundationSteps.findIndex((s) => !s.is_completed);
  return idx === -1 ? Math.max(0, foundationSteps.length - 1) : idx;
}

/** האם המשתמש רשאי לפתוח צעד (לפני / במהלך שיעור). */
export function canAccessJourneyStep(params: {
  ctx: JourneyAccessContext;
  stepId: string;
  stationId: string | null | undefined;
  isPublished: boolean;
  isCompleted: boolean;
  started: boolean;
}): boolean {
  const { ctx, stepId, stationId, isPublished, isCompleted, started } = params;
  if (!isPublished) return false;
  if (isCompleted || started) return true;

  if (ctx.foundationStationId && stationId === ctx.foundationStationId) {
    const idx = ctx.foundationSteps.findIndex((s) => s.id === stepId);
    if (idx < 0) return false;
    return idx <= foundationActiveIndex(ctx.foundationSteps);
  }

  if (ctx.foundationStationId && !ctx.foundationComplete) return false;

  return ctx.unlockedStepIds.has(stepId);
}

function scoreCatalogStep(
  step: AdminUserJourneyStepRow,
  signals: ProfileSignals
): number {
  const haystack = `${step.title} ${step.station_title}`.toLowerCase();
  let score = 0;

  if (signals.main_obstacle) {
    for (const hint of OBSTACLE_HINTS[signals.main_obstacle]) {
      if (haystack.includes(hint.toLowerCase())) score += 3;
    }
  }
  if (signals.main_obstacle_detail?.trim()) {
    const detail = signals.main_obstacle_detail.trim().toLowerCase();
    if (detail.length >= 3 && haystack.includes(detail)) score += 4;
  }
  if (signals.weakest_time_of_day) {
    for (const hint of TIME_HINTS[signals.weakest_time_of_day]) {
      if (haystack.includes(hint.toLowerCase())) score += 2;
    }
  }

  return score;
}

function catalogCandidates(
  report: AdminUserJourneyReport,
  ctx: JourneyAccessContext
): AdminUserJourneyStepRow[] {
  return report.steps
    .filter((s) => {
      if (!s.is_published || s.is_completed) return false;
      if (ctx.foundationStationId && s.station_id === ctx.foundationStationId) return false;
      if (ctx.unlockedStepIds.has(s.id)) return false;
      return true;
    })
    .sort((a, b) => a.step_number - b.step_number);
}

export async function unlockJourneyStepForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any,
  params: {
    userId: string;
    stepId: string;
    source: JourneyUnlockSource;
    reason?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from('user_journey_step_unlocks').upsert(
    {
      user_id: params.userId,
      step_id: params.stepId,
      source: params.source,
      reason: params.reason ?? null,
      unlocked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,step_id', ignoreDuplicates: true }
  );
  if (error) console.error('[journey-access] unlock failed', error);
}

export type PickNextJourneyStepResult = {
  step: AdminUserJourneyStepRow | null;
  pace: 'start' | 'continue' | 'return' | 'complete';
  phase: 'legacy' | 'foundation' | 'adaptive';
};

/** בוחר את הצעד הבא — foundation לינארי, אחר כך adaptive מהקטלוג. */
export async function pickNextJourneyStep(params: {
  report: AdminUserJourneyReport;
  ctx: JourneyAccessContext;
  signals: ProfileSignals;
  daysSinceLastActive: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any;
  userId: string;
}): Promise<PickNextJourneyStepResult> {
  const { report, ctx, signals, daysSinceLastActive, admin, userId } = params;

  const published = report.steps
    .filter((s) => s.is_published)
    .sort((a, b) => a.step_number - b.step_number);

  if (published.length === 0) {
    return { step: null, pace: 'complete', phase: 'legacy' };
  }

  // ללא תחנת foundation — התנהגות קודמת (לינארי על הכל)
  if (!ctx.foundationStationId) {
    const inProgress = published.find((s) => s.started && !s.is_completed);
    if (inProgress) {
      return { step: inProgress, pace: 'continue', phase: 'legacy' };
    }
    const nextNew = published.find((s) => !s.is_completed);
    if (!nextNew) return { step: null, pace: 'complete', phase: 'legacy' };
    const anyStarted = published.some((s) => s.started || s.is_completed);
    return {
      step: nextNew,
      pace: anyStarted ? 'continue' : 'start',
      phase: 'legacy',
    };
  }

  // ── שלב foundation ──
  if (!ctx.foundationComplete) {
    const inProgress = ctx.foundationSteps.find((s) => s.started && !s.is_completed);
    if (inProgress) {
      return { step: inProgress, pace: 'continue', phase: 'foundation' };
    }
    const nextFoundation = ctx.foundationSteps.find((s) => !s.is_completed);
    if (!nextFoundation) {
      return { step: null, pace: 'complete', phase: 'foundation' };
    }
    const anyStarted = ctx.foundationSteps.some((s) => s.started || s.is_completed);
    return {
      step: nextFoundation,
      pace: anyStarted ? 'continue' : 'start',
      phase: 'foundation',
    };
  }

  // ── שלב adaptive (קטלוג) ──
  const adaptivePublished = published.filter(
    (s) => s.station_id !== ctx.foundationStationId
  );

  const inProgressAdaptive = adaptivePublished.find(
    (s) =>
      (ctx.unlockedStepIds.has(s.id) || s.started) && !s.is_completed
  );
  if (inProgressAdaptive) {
    const pace: PickNextJourneyStepResult['pace'] =
      daysSinceLastActive !== null && daysSinceLastActive >= 3 ? 'return' : 'continue';
    return { step: inProgressAdaptive, pace, phase: 'adaptive' };
  }

  const candidates = catalogCandidates(report, ctx);
  if (candidates.length === 0) {
    const allAdaptiveDone =
      adaptivePublished.length > 0 &&
      adaptivePublished.every((s) => s.is_completed);
    return {
      step: null,
      pace: allAdaptiveDone ? 'complete' : 'complete',
      phase: 'adaptive',
    };
  }

  const scored = candidates
    .map((s) => ({ step: s, score: scoreCatalogStep(s, signals) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.step.step_number - b.step.step_number
    );

  const chosen = scored[0]!.step;
  await unlockJourneyStepForUser(admin, {
    userId,
    stepId: chosen.id,
    source: 'adaptive',
    reason:
      scored[0]!.score > 0
        ? 'profile_match'
        : 'sequential_fallback',
  });
  ctx.unlockedStepIds.add(chosen.id);

  const anyAdaptiveStarted = adaptivePublished.some(
    (s) => s.started || s.is_completed || ctx.unlockedStepIds.has(s.id)
  );

  return {
    step: chosen,
    pace: anyAdaptiveStarted ? 'continue' : 'start',
    phase: 'adaptive',
  };
}

/** מסנן קבוצות/צעדים לתצוגת המסע — foundation מלא, קטלוג רק unlocked/completed. */
export function filterJourneyGroupsForUser(
  groups: JourneyStationGroup[],
  ctx: JourneyAccessContext,
  progressByStepId: Map<string, JourneyStepProgress | null | undefined>
): JourneyStationGroup[] {
  if (!ctx.foundationStationId) return groups;

  return groups
    .map((g) => {
      const isFoundation = g.stationId === ctx.foundationStationId;

      if (isFoundation) {
        return g;
      }

      const visibleSteps = g.steps.filter((step) => {
        const prog = progressByStepId.get(step.id);
        const completed = Boolean(prog?.is_completed);
        const started = Boolean(prog);
        if (completed || started) return true;
        if (!ctx.foundationComplete) return false;
        return ctx.unlockedStepIds.has(step.id);
      });

      if (visibleSteps.length === 0) return null;

      return { ...g, steps: visibleSteps };
    })
    .filter((g): g is JourneyStationGroup => g !== null);
}

export function stepRowAccessFromProgress(
  step: JourneyStepWithProgress,
  ctx: JourneyAccessContext
): boolean {
  const prog = step.progress;
  return canAccessJourneyStep({
    ctx,
    stepId: step.id,
    stationId: step.station_id,
    isPublished: step.is_published,
    isCompleted: Boolean(prog?.is_completed),
    started: Boolean(prog),
  });
}
