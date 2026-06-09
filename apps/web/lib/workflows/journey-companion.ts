import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUserContext } from '../ai/memory';
import {
  companionIntervalForLife,
  formatLifeContextNotifyBlock,
  isLifeContextualCheckDue,
  readLifeContext,
  type LifeContext,
} from '../ai/life-context';
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
  /** דקות מההרשמה — חשוב למשתמש חדש (פחות מ-1 יום) שצריך דרבון בו ביום. */
  minutesSinceOnboarding: number | null;
  daysSinceStepTouch: number | null;
  lastSection: string | null;
  snapshot: JourneyCompanionSnapshot;
  followUp: JourneyFollowUp | null;
  followUpDue: boolean;
  daysSinceLastCompanionNudge: number | null;
  unansweredAlmogTouches: number;
  nudgeIntervalDays: number;
  lifeContext: LifeContext | null;
  lifeContextualDue: boolean;
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

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
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

function buildSnapshot(
  rows: ProgressRowLite[],
  todayDoneByTask?: ReadonlyMap<string, ReadonlySet<string>>,
  jerusalemWeekday?: number
): JourneyCompanionSnapshot {
  const asProgress = rows.map((r) => ({
    ...r,
    user_id: '',
    habits_progress: null,
    journey_steps: r.journey_steps,
  })) as ProgressRow[];
  const pending = collectPendingAcceptedTasks(asProgress, {
    todayDoneByTask,
    jerusalemWeekday,
    cronSlot: 'morning',
  });
  return {
    pendingTaskTitles: pending.slice(0, 3).map((t) => t.title),
    openAcceptedCount: pending.length,
  };
}

/** מגע ליווי — לפי מרווח + הבטחות + מגע חופשה/יום שנקבע */
export function shouldNudgeJourneyCompanion(ctx: JourneyCompanionContext): boolean {
  if (ctx.lifeContextualDue) return true;
  if (ctx.followUpDue) return true;

  /**
   * משתמש חדש שעדיין לא נגע במסע — אסור לדחות יום שלם.
   * מאמן אמיתי מדרבן בו ביום שבו ההצטרפות נסגרה, לא ימים אחרי.
   * שמירה: כל עוד עברה לפחות שעה מההצטרפות (כדי לא להציף ישר אחרי הרישום).
   */
  if (ctx.phase === 'not_started' || ctx.phase === 'step_not_opened') {
    if (ctx.minutesSinceOnboarding != null && ctx.minutesSinceOnboarding < 60) {
      return false;
    }
    const since = ctx.daysSinceLastCompanionNudge;
    if (since == null) return true;
    return since >= ctx.nudgeIntervalDays;
  }

  if (ctx.daysSinceOnboarding < 1) return false;
  const since = ctx.daysSinceLastCompanionNudge;
  if (since == null) return true;
  return since >= ctx.nudgeIntervalDays;
}

/** מגע מסע מלא — לא כשאשפוז/מינימום (אלא מגע חיים נפרד) */
export function shouldSendFullJourneyCompanion(ctx: JourneyCompanionContext): boolean {
  if (ctx.lifeContextualDue) return false;
  if (ctx.lifeContext?.push_level === 'minimal') return false;
  return shouldNudgeJourneyCompanion(ctx);
}

/** בלוק מצומצם לשילוב במגע יומי — לא משכפל את כל בלוק הליווי */
export function formatCompanionSnapshotForNotify(ctx: JourneyCompanionContext): string {
  const bits = [`מסע:${ctx.phase}·${ctx.stepTitle}`];
  if (ctx.followUp?.label) bits.push(`הבטחה:${ctx.followUp.label}`);
  if (ctx.snapshot.openAcceptedCount > 0) {
    bits.push(`נושאים:${ctx.snapshot.pendingTaskTitles.slice(0, 2).join(',')}`);
  }
  if (ctx.lifeContext) bits.push(ctx.lifeContext.summary);
  return bits.join(' | ');
}

export function formatJourneyCompanionPromptBlock(ctx: JourneyCompanionContext): string {
  const parts: string[] = [];

  if (ctx.lifeContext) {
    parts.push(formatLifeContextNotifyBlock(ctx.lifeContext));
  }

  if (ctx.followUpDue && ctx.followUp) {
    parts.push(formatJourneyFollowUpPromptBlock(ctx.followUp));
  } else if (ctx.unansweredAlmogTouches >= 2) {
    parts.push(`לא ענו ${ctx.unansweredAlmogTouches} מגעים — הישאר בקו, לא מאשים.`);
  }

  const where = ctx.stationTitle
    ? `«${ctx.stepTitle}» (תחנה ${ctx.stationTitle})`
    : `«${ctx.stepTitle}»`;

  switch (ctx.phase) {
    case 'not_started': {
      const newcomer =
        ctx.minutesSinceOnboarding != null && ctx.minutesSinceOnboarding < 36 * 60;
      if (newcomer) {
        parts.push(
          `מסע: משתמש/ת חדש/ה, כ-${Math.round((ctx.minutesSinceOnboarding ?? 0) / 60)} שעות מאז ההצטרפות, ועדיין לא הייתה נגיעה ראשונה ב-"${ctx.stepTitle}". זה מגע ראשון מאלמוג: חבר אנרגטי שמחבר את הצעד למטרה האישית ומציע חלון קטן וטבעי היום. אם המשתמש/ת בשיחה הקודמת אמר/ה "אצפה מחר" — כבד את ההבטחה ופנה רק אז.`
        );
      } else {
        parts.push(
          `מסע: עדיין לא הייתה נגיעה ראשונה ב-"${ctx.stepTitle}". דרבון חברי וקונקרטי שמחבר את הצעד למטרה האישית ומציע רגע קטן היום, בלי שפת מערכת ובלי שאלה כללית כמו "איך הולך".`
        );
      }
      break;
    }
    case 'step_not_opened':
      parts.push(
        `מסע: הגיע ${where} ועדיין לא הייתה בו נגיעה. חבר את הצעד למטרה האישית והצע חלון קטן היום בצורה חמה וקונקרטית, לא בדיקת סטטוס ולא "איך הולך".`
      );
      break;
    case 'step_stalled':
      parts.push(
        `מסע: הייתה התחלה ב-${where}, אבל אין התקדמות כבר ${ctx.daysSinceStepTouch ?? '?'} ימים. דבר כמו חבר שמחזיר מומנטום קטן: חבר את החזרה למטרה האישית ושאל בעדינות מה יעזור לפתוח מחדש את הקצב.`
      );
      break;
    case 'step_in_progress':
      parts.push(`מסע: באמצע ${where}. חזק/י את המומנטום וחבר/י את ההתקדמות למטרה האישית.`);
      break;
  }

  if (ctx.lifeContext?.push_level === 'minimal') {
    parts.push('אל תזכיר משימות/צעדים — רק אם הכול בסדר ואיך להתקדם כשירגישו מוכנים.');
    return parts.join('\n');
  }

  if (ctx.lifeContext?.push_level === 'light') {
    parts.push('אל תלחץ על מסע/משימות — מגע חברי על היום והמקום.');
  }

  if (ctx.snapshot.openAcceptedCount > 0 && ctx.lifeContext?.push_level !== 'light') {
    const titles = ctx.snapshot.pendingTaskTitles.join('; ');
    parts.push(
      `רקע פנימי: ${ctx.snapshot.openAcceptedCount} נושאים שקיבלו על עצמם (${titles}) — עניין בעדינות בשפת חיים, בלי בדיקת ביצוע.`
    );
  } else if (ctx.phase !== 'not_started') {
    parts.push('רקע פנימי: אין נושאים פתוחים כרגע — התמקד בצעד וביום.');
  }

  return parts.join('\n');
}

/** בלוק קצר למגע יומי רגיל — לא משכפל LLM מלא של ליווי מסע */
export function formatCompanionBlockForPersonalizedCheckIn(ctx: JourneyCompanionContext): string {
  return `\nרקע מסע: ${formatCompanionSnapshotForNotify(ctx)}`;
}

export async function fetchDaysSinceLastJourneyCompanionNudge(
  admin: SupabaseClient,
  userId: string
): Promise<number | null> {
    await admin
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
  opts?: { promiseDue?: boolean; minIntervalDays?: number }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const today = israelDateKey();
  if (checkpointDate !== today) {
    return { ok: false, reason: 'checkpoint_date_not_today' };
  }

  if (opts?.promiseDue) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        await admin
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

  const minDays = opts?.minIntervalDays ?? JOURNEY_COMPANION_INTERVAL_DAYS;
  const daysSince = await fetchDaysSinceLastJourneyCompanionNudge(admin, userId);
  if (daysSince != null && daysSince < minDays) {
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
      admin .from('profiles')
        .select('created_at, onboarding_completed, ai_context')
        .eq('id', userId)
        .maybeSingle(),
      admin .from('journey_steps')
        .select('id, title, step_number, journey_stations ( title )')
        .eq('is_published', true)
        .order('step_number', { ascending: true }),
      admin .from('journey_progress')
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

  /** טוען ביצועי משימות חוזרות של היום — לסינון "כבר בוצע היום". */
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayDoneByTask = new Map<string, Set<string>>();
    await admin
    .from('journey_task_executions')
    .select('task_id, slot')
    .eq('user_id', userId)
    .eq('date_key', todayKey)
    .limit(200);
  if (Array.isArray(execRows)) {
    for (const row of execRows as Array<{ task_id?: string; slot?: string }>) {
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
      if (!tid || !sl) continue;
      const cur = todayDoneByTask.get(tid) ?? new Set<string>();
      cur.add(sl);
      todayDoneByTask.set(tid, cur);
    }
  }

  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(new Date());
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = wdMap[weekdayShort] ?? 0;
  const snapshot = buildSnapshot(progressRows, todayDoneByTask, weekday);
  const progressByStep = new Map(progressRows.map((r) => [r.step_id, r]));
  const daysSinceOnboarding = daysSince(profile.created_at as string) ?? 0;
  const minutesSinceOnboardingValue = minutesSince(profile.created_at as string);
  const aiCtx = (profile.ai_context ?? {}) as AiUserContext;
  const followUp = readJourneyFollowUp(aiCtx);
  const followUpDue = isJourneyFollowUpDue(followUp);
  const lifeContext = readLifeContext(aiCtx);
  const lifeContextualDue = isLifeContextualCheckDue(lifeContext);
  const nudgeIntervalDays = companionIntervalForLife(aiCtx);

  const buildBase = (
    phase: JourneyCompanionPhase,
    step: StepRow,
    extra: Partial<JourneyCompanionContext> = {}
  ): JourneyCompanionContext => ({
    phase,
    stepId: step.id,
    stepTitle: step.title?.trim() || 'צעד במסע',
    stationTitle: stationTitleFromJoin(step.journey_stations),
    stepNumber: typeof step.step_number === 'number' ? step.step_number : null,
    daysSinceOnboarding,
    minutesSinceOnboarding: minutesSinceOnboardingValue,
    daysSinceStepTouch: null,
    lastSection: null,
    snapshot,
    followUp,
    followUpDue,
    daysSinceLastCompanionNudge: daysSinceLastNudge,
    unansweredAlmogTouches: unansweredTouches,
    nudgeIntervalDays,
    lifeContext,
    lifeContextualDue,
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
