/**
 * "רכבת הרים" — זיהוי Ghosting, פערי הרגלים, משבר והחזרה לשיחה.
 * החלטות בקוד; LLM רק לניסוח כשצריך.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isHabitMarkedDoneToday } from './almog-daily-context';
import { daysSinceIso } from './cron-ops-action';
import type { AiUserContext } from './memory';
import { parseJourneyHabitsJson } from '../workflows/habit-checkpoint-eligibility';

const DAY_MS = 24 * 60 * 60 * 1000;

const WATER_HABIT_RE = /מים|שתייה|לשתות|רטוב/i;

/** מילות מפתח לנפילה/אכילה רגשית — צ'אט בזמן אמת (ללא LLM). */
const RELAPSE_MSG_RE =
  /(?:פיצה|פיצות|בורקס|מגש|קלקלתי|נפלתי|בגדתי|אכלתי\s+המון|אכלתי\s+יותר|פשוט\s+אכלתי|לא\s+התאמצתי|בושה|אשמה|חרגתי|יום\s+גרוע\s+באוכל)/i;

export type GhostingSignals = {
  /** מגעי אלמוג בלי תשובה בחלון lookback */
  unansweredTouchCount: number;
  /** פער בהרגל יומי (למשל מים) */
  habitGap: HabitGapSignal | null;
};

export type HabitGapSignal = {
  habitId: string;
  habitTitle: string;
  kind: 'water' | 'generic';
  daysMissed: number;
};

export type ReturnVisitMode = 'none' | 'micro_win' | 're_engage' | 'crisis_reconnect';

export type ReturnVisitContext = {
  mode: ReturnVisitMode;
  daysAway: number;
  reason: string;
};

export function detectRelapseInMessage(userMessage: string): boolean {
  const msg = userMessage.replace(/\s+/g, ' ').trim();
  if (msg.length < 4) return false;
  return RELAPSE_MSG_RE.test(msg);
}

function habitProgressValue(
  habitsProgress: unknown,
  habitId: string
): unknown {
  if (!habitsProgress || typeof habitsProgress !== 'object' || Array.isArray(habitsProgress)) {
    return undefined;
  }
  return (habitsProgress as Record<string, unknown>)[habitId];
}

/**
 * ימים מאז סימון אחרון של הרגל (true) ב-journey_progress.
 */
export function daysSinceLastHabitDone(
  rows: Array<{ updated_at: string; habits_progress?: unknown }>,
  habitId: string
): number {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  for (const row of sorted) {
    const val = habitProgressValue(row.habits_progress, habitId);
    if (isHabitMarkedDoneToday(val)) {
      return daysSinceIso(row.updated_at) ?? 0;
    }
  }
  const latest = sorted[0];
  return latest ? (daysSinceIso(latest.updated_at) ?? 14) : 14;
}

export function detectPrimaryHabitGap(
  rows: Array<{
    updated_at: string;
    habits_progress?: unknown;
    journey_steps?: { habits?: unknown } | null;
  }>,
  minDaysMissed = 3
): HabitGapSignal | null {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  const anchor = sorted.find((r) => r.journey_steps);
  if (!anchor?.journey_steps) return null;

  const habits = parseJourneyHabitsJson(anchor.journey_steps.habits).filter(
    (h) => h.frequency === 'daily'
  );
  if (habits.length === 0) return null;

  let best: HabitGapSignal | null = null;
  for (const habit of habits) {
    const daysMissed = daysSinceLastHabitDone(sorted, habit.id);
    if (daysMissed < minDaysMissed) continue;
    const kind = WATER_HABIT_RE.test(habit.title) ? 'water' : 'generic';
    const candidate: HabitGapSignal = { habitId: habit.id, habitTitle: habit.title, kind, daysMissed };
    if (!best) {
      best = candidate;
      continue;
    }
    if (kind === 'water' && best.kind !== 'water') {
      best = candidate;
      continue;
    }
    if (candidate.daysMissed > best.daysMissed) best = candidate;
  }
  return best;
}

const ALMOG_TOUCH_SOURCES = new Set([
  'almog_habit_checkpoint',
  'almog_personalized_check_in',
  'onboarding_check_in',
  'almog_followup_workflow',
  'cron_ops',
]);

function isAlmogTouchMeta(meta: Record<string, unknown> | null, source: string): boolean {
  if (meta?.mentor === 'almog') return true;
  if (ALMOG_TOUCH_SOURCES.has(source)) return true;
  return source.startsWith('almog');
}

/**
 * סופר מגעי אלמוג בחלון lookback שלא זכו לתשובת user בצ'אט אחריהם.
 */
export async function countUnansweredAlmogTouches(
  admin: SupabaseClient,
  userId: string,
  lookbackDays = 7
): Promise<number> {
  const sinceIso = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifRows } = await (admin as any)
    .from('notifications')
    .select('metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(30);

  if (!Array.isArray(notifRows) || notifRows.length === 0) return 0;

  const touchTimes: number[] = [];
  for (const row of notifRows) {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const source = typeof meta?.source === 'string' ? meta.source : '';
    if (!isAlmogTouchMeta(meta, source)) continue;
    const t = new Date(String(row.created_at)).getTime();
    if (Number.isFinite(t)) touchTimes.push(t);
  }
  if (touchTimes.length === 0) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userMsgs } = await (admin as any)
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(80);

  const replyTimes = (userMsgs ?? [])
    .map((r: { created_at?: string }) => new Date(String(r.created_at)).getTime())
    .filter((t) => Number.isFinite(t));

  let unanswered = 0;
  for (const sentMs of touchTimes) {
    const replied = replyTimes.some((rt) => rt > sentMs);
    if (!replied) unanswered += 1;
  }
  return unanswered;
}

export async function fetchGhostingSignals(
  admin: SupabaseClient,
  userId: string,
  options: GhostingFetchOptions = { needUnanswered: true, needHabitGap: true }
): Promise<GhostingSignals> {
  const needUnanswered = options.needUnanswered !== false;
  const needHabitGap = options.needHabitGap !== false;

  const unansweredPromise = needUnanswered
    ? countUnansweredAlmogTouches(admin, userId, 7)
    : Promise.resolve(0);

  const progressPromise = needHabitGap
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from('journey_progress')
        .select('updated_at, habits_progress, journey_steps ( habits )')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(12)
    : Promise.resolve({ data: [], error: null });

  const [unansweredTouchCount, progressResult] = await Promise.all([
    unansweredPromise,
    progressPromise,
  ]);

  const rows = (progressResult.data ?? []) as Array<{
    updated_at: string;
    habits_progress?: unknown;
    journey_steps?: { habits?: unknown } | null;
  }>;

  return {
    unansweredTouchCount,
    habitGap: needHabitGap && !progressResult.error ? detectPrimaryHabitGap(rows) : null,
  };
}

/**
 * ימים מאז הודעת user קודמת (לא כוללת את הנוכחית — קוראים לפני insert או עם limit 2).
 */
export async function fetchDaysSincePriorUserChat(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error || !Array.isArray(data) || data.length < 2) return null;
  const priorIso = data[1]?.created_at;
  if (typeof priorIso !== 'string') return null;
  return daysSinceIso(priorIso);
}

export function resolveReturnVisitContext(params: {
  daysSincePriorChat: number | null;
  daysSinceProfileActive: number | null;
  aiContext: AiUserContext | null | undefined;
  unansweredTouchCount?: number;
}): ReturnVisitContext {
  const profileDays = params.daysSinceProfileActive ?? 0;
  const chatDays = params.daysSincePriorChat;
  const daysAway = chatDays != null ? Math.max(chatDays, profileDays) : profileDays;

  if (daysAway < 2) {
    return { mode: 'none', daysAway, reason: 'active_recently' };
  }

  const mood = String(params.aiContext?.current_mood_signal ?? '');
  const dropout = String(params.aiContext?.dropout_risk ?? 'low');
  const ghosted = (params.unansweredTouchCount ?? 0) >= 2;

  if (daysAway >= 7 && (dropout === 'high' || mood === 'frustrated' || mood === 'disengaged' || ghosted)) {
    return { mode: 'crisis_reconnect', daysAway, reason: ghosted ? 'long_absence_ghosted' : 'long_absence_risk' };
  }
  if (daysAway >= 4 || ghosted) {
    return { mode: 're_engage', daysAway, reason: ghosted ? 'ghosting_unanswered' : 'return_after_gap' };
  }
  return { mode: 'micro_win', daysAway, reason: 'short_absence_restart' };
}

/** שורת מצב קצרה לפרומפט צ'אט — חוסך טוקנים. */
export function formatReturnVisitChatBlock(ctx: ReturnVisitContext, firstName: string): string | null {
  if (ctx.mode === 'none') return null;
  const name = firstName || 'שם';
  switch (ctx.mode) {
    case 'crisis_reconnect':
      return `[מצב:חזרה-משבר·${ctx.daysAway}יום] ${name} חזר/ה אחרי היעדרות. לא "התגעגענו", לא שיפוט. הכר בקושי אפשרי (סופ"ש/עומס). צעד זעיר אחד — כוס מים. שאלה: "אתה איתי?"`;
    case 're_engage':
      return `[מצב:חזרה·${ctx.daysAway}יום] ${name} חזר/ה — סקרנות חמה, שאלה פתוחה מה הכי כבד. בלי מעקב שיעורי בית.`;
    case 'micro_win':
      return `[מצב:התחלה-מחדש·${ctx.daysAway}יום] צעד זעיר אחד (מים/נשימה). בלי אשמה. שאלה קצרה בסוף.`;
    default:
      return null;
  }
}

export function formatRelapseChatBlock(): string {
  return `[מצב:נפילה] ולידציה→צעד אחד מעכשיו. בלי שיפוט/רשימות.`;
}

/** בלוק יחיד לצ'אט — רק כשצריך (לא בכל הודעה). */
export function buildRollerCoasterChatPromptBlock(input: {
  returnVisitCtx: ReturnVisitContext;
  firstName: string;
  relapseDetected: boolean;
}): string | null {
  const visit = formatReturnVisitChatBlock(input.returnVisitCtx, input.firstName);
  if (!input.relapseDetected) return visit;
  const relapse = formatRelapseChatBlock();
  if (!visit) return relapse;
  return `${visit}\n${relapse}`;
}

/**
 * אותות חזרה לצ'אט — שאילתת מגעים רק אם יש היעדרות אפשרית (חוסך DB).
 */
/** פער הרגל היומי (3+ ימים) — לצ'אט בזמן אמת. */
export async function fetchHabitGapForChat(
  supabase: SupabaseClient,
  userId: string
): Promise<HabitGapSignal | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_progress')
    .select('updated_at, habits_progress, journey_steps ( habits )')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(12);

  if (error || !Array.isArray(data)) return null;
  return detectPrimaryHabitGap(
    data as Array<{
      updated_at: string;
      habits_progress?: unknown;
      journey_steps?: { habits?: unknown } | null;
    }>
  );
}

export async function fetchReturnVisitSignalsForChat(
  supabase: SupabaseClient,
  userId: string,
  lastActiveAt: string | null
): Promise<{ daysSincePriorChat: number | null; unansweredTouchCount: number }> {
  const daysSincePriorChat = await fetchDaysSincePriorUserChat(supabase, userId);
  const profileDays = daysSinceIso(lastActiveAt);
  const daysAway = Math.max(daysSincePriorChat ?? 0, profileDays ?? 0);
  if (daysAway < 2) {
    return { daysSincePriorChat, unansweredTouchCount: 0 };
  }
  const unansweredTouchCount = await countUnansweredAlmogTouches(supabase, userId, 7);
  return { daysSincePriorChat, unansweredTouchCount };
}

export type GhostingFetchOptions = {
  needUnanswered?: boolean;
  needHabitGap?: boolean;
};

/** האם לקרוא ל-LLM לנוטיפיקציית cron — תבניות איכותיות כברירת מחדל. */
type CronOpsNotifyAction = 'celebrate' | 'micro_win' | 'check_in' | 're_engage' | 'crisis_reconnect';

const TEMPLATE_ONLY_REASONS = new Set([
  'habit_gap_water',
  'habit_gap_generic',
  'ghosting_unanswered',
  'inactive_window',
  'crisis_long_absence',
]);

export function cronOpsShouldUseLlm(
  action: CronOpsNotifyAction,
  urgency: 'low' | 'medium' | 'high',
  aiContext: Record<string, unknown>,
  reason?: string
): boolean {
  const notes = typeof aiContext.notes === 'string' ? aiContext.notes.trim() : '';
  const hasNotes = notes.length > 0;

  if (reason && TEMPLATE_ONLY_REASONS.has(reason) && !hasNotes) {
    return false;
  }

  if (!hasNotes) {
    if (action === 'celebrate' || action === 'crisis_reconnect' || action === 'micro_win' || action === 're_engage') {
      return false;
    }
    if (action === 'check_in') return false;
  }

  if (action === 'celebrate') return true;
  if (action === 'crisis_reconnect' || action === 'micro_win' || action === 're_engage') {
    return urgency === 'high' || hasNotes;
  }
  if (action === 'check_in') return hasNotes || urgency === 'high';
  return false;
}

/** תיאור סיבה פנימית ל-LLM / תבנית */
export function cronOpsReasonHint(reason: string, habitGap: HabitGapSignal | null): string {
  switch (reason) {
    case 'habit_gap_water':
      return habitGap
        ? `פער בהרגל מים (${habitGap.habitTitle}) — כ-${habitGap.daysMissed} ימים בלי סימון. כוס אחת, בלי שיפוט.`
        : 'פער בהרגל מים — כוס אחת, בלי שיפוט.';
    case 'ghosting_unanswered':
      return 'אלמוג שלח והמשתמש לא ענה — הכר בעומס, לא "ראיתי שלא".';
    case 'crisis_long_absence':
      return 'היעדרות ארוכה + סיכון נטישה — חיבור מחדש רך, צעד זעיר.';
    case 'needs_small_win':
      return 'צעד זעיר להחזרת מומנטום — בלי אשמה.';
    case 'inactive_window':
      return 'חיבור מחדש אחרי היעדרות — סקרנות, לא "התגעגענו".';
    default:
      return reason;
  }
}
