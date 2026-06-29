import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemDateKey } from '@/lib/journey/task-schedule';
import type { ChallengeEnrollment } from './types';

export type SuccessEventInput = {
  enrollment_id: string;
  user_id: string;
  event_type: string;
  title: string;
  description?: string;
  detected_by: 'rule' | 'ai' | 'admin';
  evidence?: Record<string, unknown>;
};

const NEGATIVE_PHRASES = [
  'נכשל',
  'לא הצלחתי',
  'אין לי כוח',
  'אין מצב',
  'מייאש',
  'כישלון',
  'לא שווה',
  'אין תקווה',
];

const POSITIVE_SHIFT_PHRASES = [
  'ניסיתי',
  'התמדתי',
  'הצלחתי',
  'גאה',
  'הרגשתי טוב',
  'קל יותר',
  'פחות מתוק',
  'לא חיפשתי',
];

export async function persistSuccessEvent(
  admin: SupabaseClient,
  input: SuccessEventInput,
): Promise<boolean> {
  const dedupeKey = `${input.event_type}:${input.title}`.slice(0, 120);

  const { data: existing } = await admin
    .from('challenge_success_events')
    .select('id')
    .eq('enrollment_id', input.enrollment_id)
    .eq('event_type', input.event_type)
    .eq('title', input.title)
    .limit(1)
    .maybeSingle();

  if (existing) return false;

  const { error } = await admin.from('challenge_success_events').insert({
    enrollment_id: input.enrollment_id,
    user_id: input.user_id,
    event_type: input.event_type,
    title: input.title,
    description: input.description ?? null,
    detected_by: input.detected_by,
    evidence: { ...input.evidence, dedupe_key: dedupeKey },
  });

  return !error;
}

export function countPhraseHits(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  return phrases.reduce((n, p) => (lower.includes(p) ? n + 1 : n), 0);
}

/** זיהוי שינוי שפה — פחות שלילי / יותר חיובי ביחס ל-baseline */
export function detectLanguageShift(params: {
  recentUserText: string;
  baselineText?: string | null;
}): { detected: boolean; title: string; description: string } | null {
  const recent = params.recentUserText;
  if (recent.length < 40) return null;

  const recentNeg = countPhraseHits(recent, NEGATIVE_PHRASES);
  const recentPos = countPhraseHits(recent, POSITIVE_SHIFT_PHRASES);
  const base = params.baselineText ?? '';
  const baseNeg = base ? countPhraseHits(base, NEGATIVE_PHRASES) : 1;

  if (recentNeg < baseNeg && recentPos >= 1) {
    return {
      detected: true,
      title: 'שינית את השפה שלך',
      description: 'שמתי לב שאת/ה מדבר/ת אחרת — פחות "נכשלתי", יותר "ניסיתי". זו הצלחה אמיתית.',
    };
  }

  if (recentPos >= 2 && recentNeg === 0) {
    return {
      detected: true,
      title: 'אנרגיה חיובית בשיחה',
      description: 'השפה שלך היום מלאה בצמיחה — אלמוג שם לב לזה.',
    };
  }

  return null;
}

/** סטריק ימים עם לפחות משימה אחת */
export async function detectCompletionStreak(
  admin: SupabaseClient,
  enrollmentId: string,
  minDays: number,
): Promise<{ days: number } | null> {
  const { data } = await admin
    .from('challenge_task_completions')
    .select('day_index')
    .eq('enrollment_id', enrollmentId);

  if (!data?.length) return null;

  const daysWithActivity = new Set(data.map((r) => r.day_index as number));
  let streak = 0;
  for (let d = Math.max(...daysWithActivity); d >= 1; d--) {
    if (daysWithActivity.has(d)) streak++;
    else break;
  }

  if (streak >= minDays) return { days: streak };
  return null;
}

export async function scanAndPersistChallengeSuccesses(
  admin: SupabaseClient,
  enrollment: ChallengeEnrollment,
  opts?: {
    recentChatUserText?: string;
    baselineText?: string | null;
    dayIndex?: number;
  },
): Promise<number> {
  let created = 0;

  const streak = await detectCompletionStreak(admin, enrollment.id, 3);
  if (streak) {
    const ok = await persistSuccessEvent(admin, {
      enrollment_id: enrollment.id,
      user_id: enrollment.user_id,
      event_type: 'consistency_streak',
      title: `${streak.days} ימים ברצף עם פעילות`,
      description: 'עקביות היא המפתח — לא מושלמות.',
      detected_by: 'rule',
      evidence: { streak_days: streak.days },
    });
    if (ok) created++;
  }

  if (opts?.recentChatUserText) {
    const shift = detectLanguageShift({
      recentUserText: opts.recentChatUserText,
      baselineText: opts.baselineText,
    });
    if (shift) {
      const ok = await persistSuccessEvent(admin, {
        enrollment_id: enrollment.id,
        user_id: enrollment.user_id,
        event_type: 'language_shift',
        title: shift.title,
        description: shift.description,
        detected_by: 'rule',
      });
      if (ok) created++;
    }
  }

  const todayKey = jerusalemDateKey();
  const { count: todayDone } = await admin
    .from('challenge_task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollment.id)
    .gte('completed_at', `${todayKey}T00:00:00`);

  if (todayDone && todayDone >= 3) {
    const ok = await persistSuccessEvent(admin, {
      enrollment_id: enrollment.id,
      user_id: enrollment.user_id,
      event_type: 'multi_task_day',
      title: `${todayDone} משימות היום — אלופ/ה!`,
      description: 'כל סימון קטן נספר. זה בדיוק איך שינוי אמיתי נראה.',
      detected_by: 'rule',
      evidence: { count: todayDone, day_index: opts?.dayIndex ?? null },
    });
    if (ok) created++;
  }

  return created;
}
