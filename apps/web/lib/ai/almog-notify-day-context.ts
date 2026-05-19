import type { SupabaseClient } from '@supabase/supabase-js';

import { getIsraelNowMinutes } from './almog-time-context';
import type { HabitCheckpointSlot } from '../workflows/almog-habit-checkpoint-payload';

const SLOT_HE: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  evening: 'ערב',
};

/** קיצור snippets בפרומפט — חוסך טוקנים. */
const TOUCH_SNIPPET_CHARS = 72;
const MAX_TOUCHES_TODAY = 6;
const MAX_PRIOR_IN_PROMPT = 2;

const ALMOG_NOTIFY_SOURCES = new Set([
  'almog_habit_checkpoint',
  'almog_personalized_check_in',
  'onboarding_check_in',
  'almog_followup_workflow',
  'cron_ops',
]);

export type TodayAlmogTouch = {
  slot: HabitCheckpointSlot | null;
  slotLabel: string;
  bodySnippet: string;
  sentAt: string;
  userRepliedSince: boolean;
};

/** שורה אחת — אנרגיית חלון יום (חוסך טוקנים). */
export function buildSlotDaypartPromptBlock(slot: HabitCheckpointSlot): string {
  switch (slot) {
    case 'morning':
      return 'בוקר: קצר, אנרגטי, מניע — לא בוחן.';
    case 'midday':
      return 'צהריים: check-in אמפתי לעומס — "איך הולך?", לא "למה לא".';
    case 'evening':
      return 'ערב: סיכום רך, בלי אשמה — שאלה פתוחה על היום.';
    default:
      return '';
  }
}

function jerusalemTodayStartIso(now = new Date()): string {
  const minutesSinceMidnight = getIsraelNowMinutes();
  return new Date(now.getTime() - minutesSinceMidnight * 60 * 1000).toISOString();
}

function slotFromMetadata(meta: Record<string, unknown> | null): HabitCheckpointSlot | null {
  const raw = meta?.slot;
  if (raw === 'morning' || raw === 'midday' || raw === 'evening') return raw;
  const idx = meta?.check_in_index;
  if (typeof idx === 'number') {
    if (idx === 0) return 'morning';
    if (idx === 1) return 'midday';
    return 'evening';
  }
  return null;
}

function isAlmogNotifyRow(meta: Record<string, unknown> | null, source: string): boolean {
  if (meta?.mentor === 'almog') return true;
  if (ALMOG_NOTIFY_SOURCES.has(source)) return true;
  return source.startsWith('almog');
}

function snippet(body: string): string {
  const t = body.trim();
  return t.length > TOUCH_SNIPPET_CHARS ? `${t.slice(0, TOUCH_SNIPPET_CHARS)}…` : t;
}

/**
 * מגעי אלמוג מהיום (ישראל). שאילתת צ'אט רק אם יש מגעים — חוסך round-trip ל-DB.
 */
export async function fetchTodayAlmogTouches(
  admin: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<TodayAlmogTouch[]> {
  const dayStartIso = jerusalemTodayStartIso(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifRows } = await (admin as any)
    .from('notifications')
    .select('body, metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', dayStartIso)
    .order('created_at', { ascending: true })
    .limit(MAX_TOUCHES_TODAY);

  if (!Array.isArray(notifRows) || notifRows.length === 0) return [];

  const touches: Omit<TodayAlmogTouch, 'userRepliedSince'>[] = [];
  for (const row of notifRows) {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const source = typeof meta?.source === 'string' ? meta.source : '';
    if (!isAlmogNotifyRow(meta, source)) continue;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (!body) continue;
    const slot = slotFromMetadata(meta);
    touches.push({
      slot,
      slotLabel: slot ? SLOT_HE[slot] : 'מגע',
      bodySnippet: snippet(body),
      sentAt: String(row.created_at),
    });
  }

  if (touches.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userMsgs } = await (admin as any)
    .from('ai_interactions')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', dayStartIso)
    .order('created_at', { ascending: true })
    .limit(24);

  const replyTimes = (userMsgs ?? [])
    .map((r: { created_at?: string }) => r.created_at)
    .filter((t): t is string => typeof t === 'string');

  return touches.map((t) => {
    const sentMs = new Date(t.sentAt).getTime();
    const userRepliedSince = replyTimes.some((rt) => new Date(rt).getTime() > sentMs);
    return { ...t, userRepliedSince };
  });
}

/** אם כבר יש מגעים היום — לא צריך גם היסטוריית 7 ימים (חוסך טוקנים + שאילתה). */
export function shouldFetchWeekRecentBodies(
  todayTouches: TodayAlmogTouch[],
  currentSlot: HabitCheckpointSlot
): boolean {
  const priorToday = todayTouches.filter((t) => t.slot !== currentSlot || !t.slot);
  return priorToday.length === 0;
}

/**
 * בלוק קומפקטי לדילוג — מקסימום 2 מגעים קודמים.
 */
export function formatTodayTouchesCooldownBlock(
  touches: TodayAlmogTouch[],
  currentSlot: HabitCheckpointSlot
): string | null {
  const prior = touches.filter((t) => t.slot !== currentSlot || !t.slot);
  if (prior.length === 0) return null;

  const shown = prior.slice(-MAX_PRIOR_IN_PROMPT);
  const unanswered = shown.filter((t) => !t.userRepliedSince);

  const lines = shown.map((t) => {
    const flag = t.userRepliedSince ? 'ענה' : 'ללא תשובה';
    return `${t.slotLabel}: "${t.bodySnippet}" (${flag})`;
  });

  if (unanswered.length > 0) {
    return `מגעים קודמים היום:\n${lines.join('\n')}\nדילוג: זווית חדשה; אם ללא תשובה — הכר בעומס (לא "ראיתי שלא"); שאלה פתוחה.`;
  }

  return `מגעים קודמים היום:\n${lines.join('\n')}\nהמשך שיחה — לא לפתוח מחדש כרובוט.`;
}

/** היסטוריה שבועית קצרה — רק כשאין מגעים קודמים היום. */
export function formatRecentBodiesAntiRepeatBlock(bodies: string[]): string | null {
  if (bodies.length === 0) return null;
  const lines = bodies
    .slice(0, 2)
    .map((b, i) => `${i + 1}. "${snippet(b)}"`);
  return `אל תחזור על פתיחה/מטאפורה מ:\n${lines.join('\n')}`;
}
