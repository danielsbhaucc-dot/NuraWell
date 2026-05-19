import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUserContext } from '../ai/memory';
import {
  formatJourneyFollowUpPromptBlock,
  isJourneyFollowUpDue,
  readJourneyFollowUp,
  type JourneyFollowUp,
} from '../ai/journey-follow-up-promise';
import { countUnansweredAlmogTouches } from '../ai/roller-coaster';
import { israelDateKey } from '../ai/onboarding-check-in-time';
import {
  collectPendingAcceptedTasks,
  type ProgressRow,
} from './habit-checkpoint-batch';

const DAY_MS = 24 * 60 * 60 * 1000;
/** מגע ליווי מסע — לפחות פעם ביום כל עוד המסע לא הושלם */
export const JOURNEY_COMPANION_INTERVAL_DAYS = 1;

export type JourneyCompanionPhase =
  | 'not_started'
  | 'step_not_opened'
  | 'step_in_progress'
  | 'step_stalled';

export type JourneyCompanionSnapshot = {
  pendingTaskTitles: string[];
  openAcceptedCount: number;
};

export type JourneyCompanionContext = {
  phase: JourneyCompanionPhase;
  stepId: string;
  stepTitle: string;
  stationTitle: string | null;
  stepNumber: number | null;
  daysSinceOnboarding: number;
  daysSinceStepTouch: number | null;
  lastSection: string | null;
  snapshot: JourneyCompanionSnapshot;
  followUp: JourneyFollowUp | null;
  followUpDue: boolean;
  daysSinceLastCompanionNudge: number | null;
  unansweredAlmogTouches: number;
  nudgeIntervalDays: number;
};

type ProgressRowLite = {
  step_id: string;
  is_completed: boolean | null;
  video_watched: boolean | null;
  updated_at: string;
  created_at: string;
  last_section: string | null;
  task_statuses: unknown;
  journey_steps: {
    title: string | null;
    tasks: unknown;
    journey_stations: unknown;
  } | null;
};

type StepRow = {
  id: string;
  title: string | null;
  step_number: number | null;
  journey_stations: unknown;
};

const JOURNEY_PROGRESS_FULL_SELECT = `
  step_id,
  is_completed,
  video_watched,
  updated_at,
  created_at,
  last_section,
  task_statuses,
  user_id,
  journey_steps (
    title,
    tasks,
    habits,
    journey_stations ( title )
  )
`;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function stationTitleFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const t = raw[0] && typeof raw[0] === 'object' ? (raw[0] as { title?: string }).title : undefined;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  }
  if (typeof raw === 'object' && 'title' in raw) {
    const t = (raw as { title?: unknown }).title;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  }
  return null;
}

function buildSnapshot(rows: ProgressRowLite[]): JourneyCompanionSnapshot {
  const asProgress = rows.map((r) => ({
    ...r,
    user_id: '',
    habits_progress: null,
    journey_steps: r.journey_steps,
  })) as ProgressRow[];
  const pending = collectPendingAcceptedTasks(asProgress);
  return {
    pendingTaskTitles: pending.slice(0, 3).map((t) => t.title),
    openAcceptedCount: pending.length,
  };
}

/** מגע ליווי — כל יום (או מיד כשהבטחה מהצ'אט מגיעה). */
export function shouldNudgeJourneyCompanion(ctx: JourneyCompanionContext): boolean {
  if (ctx.followUpDue) return true;
  if (ctx.daysSinceOnboarding < 1) return false;
  const since = ctx.daysSinceLastCompanionNudge;
  if (since == null) return true;
  return since >= ctx.nudgeIntervalDays;
}

export function formatJourneyCompanionPromptBlock(ctx: JourneyCompanionContext): string {
  const parts: string[] = [];

  parts.push(
    'עקרון: אלמוג לא נעלם — גם בלי תשובה. בדוק מצב צעד/נושאים ברקע פנימי; בטון חבר, לא מעקב.'
  );

  if (ctx.followUpDue && ctx.followUp) {
    parts.push(formatJourneyFollowUpPromptBlock(ctx.followUp));
  }

  if (ctx.unansweredAlmogTouches >= 2) {
    parts.push(
      `לא ענו ל-${ctx.unansweredAlmogTouches} מגעים לאחרונים — הישאר בקו ("מה קורה איתך?" לא "למה לא ענית").`
    );
  }

  const where = ctx.stationTitle
    ? `«${ctx.stepTitle}» (תחנה ${ctx.stationTitle})`
    : `«${ctx.stepTitle}»`;

  switch (ctx.phase) {
    case 'not_started':
      parts.push(`מסע: עדיין לא התחיל. ${where} — הזמנה רכה, לא משימה.`);
      break;
    case 'step_not_opened':
      parts.push(`מסע: ${where} מחכה — שאל מה קורה ביום, בלי לחץ.`);
      break;
    case 'step_stalled':
      parts.push(
        `מסע: התחילו ${where}, לא סיימו (${ctx.daysSinceStepTouch ?? '?'} ימים) — הכול בסדר? משהו לא ברור?`
      );
      break;
    case 'step_in_progress':
      parts.push(`מסע: באמצע ${where} — איך הולך, משהו תקוע?`);
      break;
  }

  if (ctx.snapshot.openAcceptedCount > 0) {
    const titles = ctx.snapshot.pendingTaskTitles.join('; ');
    parts.push(
      `רקע פנימי: ${ctx.snapshot.openAcceptedCount} נושאים שקיבלו על עצמם (${titles}) — עניין בעדינות בשפת חיים, בלי בדיקת ביצוע.`
    );
  } else if (ctx.phase !== 'not_started') {
    parts.push('רקע פנימי: אין נושאים פתוחים כרגע — התמקד בצעד וביום.');
  }

  return parts.join('\n');
}

/** בלוק קצר למגע יומי רגיל כשליווי המסע כבר נשלח היום */
export function formatCompanionBlockForPersonalizedCheckIn(ctx: JourneyCompanionContext): string {
  return `\nליווי מסע (רקע):\n${formatJourneyCompanionPromptBlock(ctx)}`;
}

export async function fetchDaysSinceLastJourneyCompanionNudge(
  admin: SupabaseClient,
  userId: string
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('created_at, metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .order('created_at', { ascending: false })
    .limit(30);

  for (const row of data ?? []) {
    const meta = (row as { metadata?: { source?: string } }).metadata;
    if (meta?.source === 'almog_journey_companion') {
      return daysSince((row as { created_at: string }).created_at);
    }
  }
  return null;
}

export async function gateJourneyCompanionNotify(
  admin: SupabaseClient,
  userId: string,
  checkpointDate: string,
  opts?: { promiseDue?: boolean }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const today = israelDateKey();
  if (checkpointDate !== today) {
    return { ok: false, reason: 'checkpoint_date_not_today' };
  }

  if (opts?.promiseDue) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from('notifications')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', 'ai_message')
      .gte('created_at', twoHoursAgo)
      .limit(12);

    if (error) return { ok: false, reason: `db_error:${error.message}` };
    const dup = (data ?? []).some((row: { metadata?: { source?: string; journey_promise?: boolean } }) => {
      const m = row.metadata;
      return m?.source === 'almog_journey_companion' && m?.journey_promise === true;
    });
    if (dup) return { ok: false, reason: 'promise_nudge_recent' };
    return { ok: true };
  }

  const daysSince = await fetchDaysSinceLastJourneyCompanionNudge(admin, userId);
  if (daysSince != null && daysSince < JOURNEY_COMPANION_INTERVAL_DAYS) {
    return { ok: false, reason: 'companion_interval_not_elapsed' };
  }

  return { ok: true };
}

export async function fetchJourneyCompanionContext(
  admin: SupabaseClient,
  userId: string
): Promise<JourneyCompanionContext | null> {
  const [profileRes, stepsRes, progressRes, daysSinceLastNudge, unansweredTouches] =
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from('profiles')
        .select('created_at, onboarding_completed, ai_context')
        .eq('id', userId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from('journey_steps')
        .select('id, title, step_number, journey_stations ( title )')
        .eq('is_published', true)
        .order('step_number', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from('journey_progress')
        .select(JOURNEY_PROGRESS_FULL_SELECT)
        .eq('user_id', userId),
      fetchDaysSinceLastJourneyCompanionNudge(admin, userId),
      countUnansweredAlmogTouches(admin, userId, 14),
    ]);

  const profile = profileRes.data;
  if (!profile?.onboarding_completed) return null;

  const published = (stepsRes.data ?? []) as StepRow[];
  if (published.length === 0) return null;

  const progressRows = (progressRes.data ?? []) as ProgressRowLite[];
  const snapshot = buildSnapshot(progressRows);
  const progressByStep = new Map(progressRows.map((r) => [r.step_id, r]));
  const daysSinceOnboarding = daysSince(profile.created_at as string) ?? 0;
  const aiCtx = (profile.ai_context ?? {}) as AiUserContext;
  const followUp = readJourneyFollowUp(aiCtx);
  const followUpDue = isJourneyFollowUpDue(followUp);

  const buildBase = (
    phase: JourneyCompanionPhase,
    step: StepRow,
    extra: Partial<JourneyCompanionContext>
  ): JourneyCompanionContext => ({
    phase,
    stepId: step.id,
    stepTitle: step.title?.trim() || 'צעד במסע',
    stationTitle: stationTitleFromJoin(step.journey_stations),
    stepNumber: typeof step.step_number === 'number' ? step.step_number : null,
    daysSinceOnboarding,
    daysSinceStepTouch: null,
    lastSection: null,
    snapshot,
    followUp,
    followUpDue,
    daysSinceLastCompanionNudge: daysSinceLastNudge,
    unansweredAlmogTouches: unansweredTouches,
    nudgeIntervalDays: JOURNEY_COMPANION_INTERVAL_DAYS,
    ...extra,
  });

  if (progressRows.length === 0) {
    return buildBase('not_started', published[0]!);
  }

  let focusStep: StepRow | null = null;
  let focusProgress: ProgressRowLite | null = null;

  for (const step of published) {
    const pr = progressByStep.get(step.id);
    if (!pr?.is_completed) {
      focusStep = step;
      focusProgress = pr ?? null;
      break;
    }
  }

  if (!focusStep) return null;

  if (!focusProgress) {
    return buildBase('step_not_opened', focusStep);
  }

  const daysSinceStepTouch = daysSince(focusProgress.updated_at);
  const lastSection = focusProgress.last_section ?? null;

  if (focusProgress.is_completed) return null;

  if ((daysSinceStepTouch ?? 0) >= 1) {
    return buildBase('step_stalled', focusStep, { daysSinceStepTouch, lastSection });
  }

  return buildBase('step_in_progress', focusStep, { daysSinceStepTouch, lastSection });
}
