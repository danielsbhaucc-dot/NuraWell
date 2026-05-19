import type { SupabaseClient } from '@supabase/supabase-js';

import type { TodayAlmogTouch } from './almog-notify-day-context';
import type { AiUserContext } from './memory';

const CHAT_SNIPPET_CHARS = 72;
const MAX_CHAT_TURNS = 5;

export type TodayChatTurn = {
  role: 'user' | 'assistant';
  snippet: string;
  createdAt: string;
};

export function jerusalemDayStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const minutesSinceMidnight = hour * 60 + minute;
  return new Date(now.getTime() - minutesSinceMidnight * 60 * 1000).toISOString();
}

function chatSnippet(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > CHAT_SNIPPET_CHARS ? `${t.slice(0, CHAT_SNIPPET_CHARS)}…` : t;
}

/**
 * תמלילי צ'אט מהיום (ישראל) — מקור האמת ל"מה קרה הבוקר".
 */
export async function fetchTodayChatTurns(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<TodayChatTurn[]> {
  const dayStartIso = jerusalemDayStartIso(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ai_interactions')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .in('role', ['user', 'assistant'])
    .gte('created_at', dayStartIso)
    .order('created_at', { ascending: true })
    .limit(MAX_CHAT_TURNS);

  if (error || !Array.isArray(data)) return [];

  const out: TodayChatTurn[] = [];
  for (const row of data) {
    const role = row.role;
    const content = typeof row.content === 'string' ? row.content.trim() : '';
    if ((role !== 'user' && role !== 'assistant') || !content) continue;
    out.push({
      role,
      snippet: chatSnippet(content),
      createdAt: String(row.created_at),
    });
  }
  return out;
}

/** האם הרגל סומן כבוצע היום ב-journey_progress (מערך [true] או דגלים יומיים). */
export function isHabitMarkedDoneToday(progressValue: unknown): boolean {
  if (!Array.isArray(progressValue)) return false;
  return progressValue.some((v) => v === true);
}

export function mergeHabitsDoneTodayFromRows(
  rows: Array<{ habits_progress?: unknown; updated_at: string }>
): Set<string> {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  /** שורה עדכנית יותר גוברת לכל habitId */
  const latest = new Map<string, boolean>();
  for (const row of sorted) {
    const hp = row.habits_progress;
    if (!hp || typeof hp !== 'object' || Array.isArray(hp)) continue;
    for (const [habitId, value] of Object.entries(hp as Record<string, unknown>)) {
      if (!latest.has(habitId)) {
        latest.set(habitId, isHabitMarkedDoneToday(value));
      }
    }
  }
  return new Set([...latest.entries()].filter(([, done]) => done).map(([id]) => id));
}

function formatChatTurnsLine(turns: TodayChatTurn[]): string | null {
  if (turns.length === 0) return null;
  return turns
    .map((t) => `${t.role === 'user' ? 'U' : 'A'}:"${t.snippet}"`)
    .join(' | ');
}

function formatProfileDaySignalsLine(ctx: AiUserContext | null | undefined): string | null {
  if (!ctx) return null;
  const parts: string[] = [];
  if (ctx.main_blocker?.trim()) parts.push(`חסם:${ctx.main_blocker.trim()}`);
  if (ctx.notes?.trim()) parts.push(`הערה:${ctx.notes.trim()}`);
  if (ctx.avoid_push) parts.push('פחות-דחיפה');
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

type DailyBlockInput = {
  chatTurns?: TodayChatTurn[];
  todayTouches?: TodayAlmogTouch[];
  aiContext?: AiUserContext | null;
};

/**
 * בלוק זיכרון קצר-טווח (יום) לצ'אט או לנוטיפיקציה.
 */
export function formatDailyShortTermBlock(input: DailyBlockInput): string | null {
  const segs: string[] = [];
  const chat = formatChatTurnsLine(input.chatTurns ?? []);
  if (chat) segs.push(`צ'אט:${chat}`);

  const profile = formatProfileDaySignalsLine(input.aiContext);
  if (profile) segs.push(profile);

  const touches = input.todayTouches ?? [];
  if (touches.length > 0) {
    const touchLine = touches
      .slice(-2)
      .map((t) => `${t.slotLabel}:"${t.bodySnippet}"${t.userRepliedSince ? '' : '·ללא-תשובה'}`)
      .join(' | ');
    segs.push(`מגעים:${touchLine}`);
  }

  if (segs.length === 0) return null;
  return `[יום] ${segs.join(' · ')} — התאם טון; אירוע/לוויה/מילואים=בלי תזכורת גנרית.`;
}

/** משתמשים עם הודעת user בצ'אט היום — לחיזוק נוכחות. */
export async function fetchUserIdsWithChatToday(
  supabase: SupabaseClient,
  now = new Date()
): Promise<Set<string>> {
  const dayStartIso = jerusalemDayStartIso(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ai_interactions')
    .select('user_id')
    .eq('role', 'user')
    .gte('created_at', dayStartIso)
    .limit(4000);

  if (error || !Array.isArray(data)) return new Set();
  const ids = new Set<string>();
  for (const row of data) {
    if (typeof row.user_id === 'string') ids.add(row.user_id);
  }
  return ids;
}

/** שער: 3+ מגעים בלי תשובה — רק לתזכורות, לא לחיזוק. */
export function shouldSkipNotifyForTouchFatigue(
  todayTouches: TodayAlmogTouch[],
  mode: 'remind' | 'reinforce' = 'remind'
): boolean {
  if (mode === 'reinforce') return false;
  const unanswered = todayTouches.filter((t) => !t.userRepliedSince);
  return unanswered.length >= 3;
}
