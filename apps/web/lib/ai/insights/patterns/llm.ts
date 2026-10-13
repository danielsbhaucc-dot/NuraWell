/**
 * Nightly pattern insights — LLM phrasing/confirmation step (one cheap call per active user).
 * Model: INSIGHT_PATTERN_MODEL, default AI_MODELS.empathy (gpt-5-mini) — low volume (≤1 call per
 * user per night, only when there was new activity), so quality wins over the last cent.
 */

import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';

import { createAiProvider } from '@/lib/ai/provider-factory';
import { AI_MODELS } from '../../client';
import { ALMOG_NUTRITION_SAFETY_RULES, isNutritionSafe } from '../../safety/nutrition-safety';
import { isStorableMemoryText } from '../../safety/memory-text-guard';
import type { PatternCandidate } from './detect';

export const PATTERN_MODEL = process.env.INSIGHT_PATTERN_MODEL?.trim() || AI_MODELS.empathy;

export const PatternTheme = z.enum([
  'hard_weekday',
  'weekend_dip',
  'hard_daypart',
  'strong_weekday',
  'evening_sweets',
  'night_eating',
  'emotional_eating',
  'weekend_eating',
  'skipped_meals',
  'stress_trigger',
  'sleep',
  'social_eating',
  'success_routine',
]);

export const PatternInsight = z.object({
  /** stable key: candidate key as given, or "<theme>" for chat-derived patterns */
  key: z.string().min(3).max(60),
  theme: PatternTheme,
  category: z.enum(['nutrition', 'mental', 'blocker', 'preference', 'fitness']),
  /** for Almog (3rd person, dated): "מאז 20.9 — 3 מתוך 4 שבתות היו קשות (20.9, 27.9, 11.10)" */
  insight_he: z.string().min(8).max(260),
  /** for the user (2nd person, warm, one sentence) — shown on home/plan/progress */
  user_line_he: z.string().min(8).max(160),
  /** one small, general, publicly-known step (never a personal diet prescription) */
  tip_he: z.string().min(6).max(200),
  /** short plan title Almog can offer as a task card, e.g. "תוכנית קטנה לשבת" (or empty) */
  plan_title_he: z.string().max(60).default(''),
  evidence_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(2).max(12),
  confidence: z.number().min(0).max(1),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  daypart: z.enum(['morning', 'midday', 'evening', 'night']).nullable().default(null),
});
export type PatternInsight = z.infer<typeof PatternInsight>;

const Result = z.object({ patterns: z.array(PatternInsight).max(4) });

const SYSTEM = `אתה מנתח התנהגות ברקע עבור אלמוג, מנטור הרגלים בעברית (NuraWell). אתה לא מדבר עם המשתמש.
המטרה: למצוא 0–3 דפוסים *חוזרים ומתוארכים* שיעזרו לאלמוג לתכנן מראש (למשל: שבתות קשות, מתוקים בערב באופן קבוע, יותר פחמימות בסופ"ש).

חוקי ברזל:
- דפוס = חוזר לפחות ב-2 תאריכים שונים, עם תאריכים מהנתונים בלבד. בלי תאריכים אמיתיים — אל תחזיר.
- מועמדים מספריים (candidates) כבר נבדקו בקוד: אשר/נסח אותם אם הם הגיוניים; key = ה-key שלהם בדיוק.
- דפוסי אוכל/רגש מהשיחות: key = שם ה-theme (למשל "evening_sweets"). רק אם המשתמש עצמו תיאר את זה ביותר מתאריך אחד.
- insight_he: לאלמוג, גוף שלישי, עם תאריכים בפורמט D.M ("ב-20.9, 27.9 ו-11.10"). עובדתי, בלי שיפוט.
- user_line_he: למשתמש, גוף שני, חם וקצר, כמו חבר שם לב ("שמתי לב שהשבתות קצת יותר מאתגרות אותך"). בלי המילה "תובנה", בלי "המערכת זיהתה".
- tip_he: צעד קטן אחד, כללי ומוכר. לדוגמה לשבת קשה: "להחליט כבר ביום שישי על דבר אחד קטן שעושים בשבת בבוקר". למתוקים בערב: "להכין מראש נשנוש ערב שאתה אוהב ופחות מתוק".
- plan_title_he: כותרת קצרה למשימת הכנה שאלמוג יכול להציע (למשל "הכנה קטנה לשבת"), או "" אם לא מתאים.
- אסור placeholders בסוגריים מרובעים. השתמש בשם רק אם ניתן.
- confidence < 0.6 → אל תחזיר.

${ALMOG_NUTRITION_SAFETY_RULES}`;

export function formatDateDM(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${Number(d)}.${Number(m)}`;
}

/** Deterministic validation applied to everything the model returns. */
export function acceptPattern(p: PatternInsight, allowedDates: Set<string>): boolean {
  if (p.confidence < 0.6) return false;
  const real = p.evidence_dates.filter((d) => allowedDates.has(d));
  if (new Set(real).size < 2) return false; // must be grounded in ≥2 real dates
  for (const t of [p.insight_he, p.user_line_he, p.tip_he, p.plan_title_he]) {
    if (t && (!isStorableMemoryText(t, 1) || !isNutritionSafe(t))) return false;
  }
  return true;
}

export async function phrasePatterns(params: {
  firstName: string;
  candidates: PatternCandidate[];
  /** dated chat digest lines: "[2026-10-11 21:40] user: ..." */
  digest: string;
  existing: Array<{ key: string; insight: string }>;
  allowedDates: Set<string>;
}): Promise<PatternInsight[]> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) return [];
  if (params.candidates.length === 0 && params.digest.trim().length < 80) return [];
  const prompt = [
    `שם פרטי: ${params.firstName}`,
    `מועמדים מספריים (נבדקו בקוד):\n${
      params.candidates.length
        ? params.candidates
            .map((c) => `- key=${c.key}${c.weekday != null ? ` weekday=${c.weekday}` : ''}${c.daypart ? ` daypart=${c.daypart}` : ''}: ${c.summaryHe}. תאריכים: ${c.evidenceDates.join(', ')}`)
            .join('\n')
        : '(אין)'
    }`,
    `דפוסים שכבר שמורים (עדכן אם עדיין נכונים, באותו key):\n${
      params.existing.length ? params.existing.map((e) => `- ${e.key}: ${e.insight}`).join('\n') : '(אין)'
    }`,
    `יומן שיחות מתוארך (28 יום אחרונים, הודעות המשתמש בלבד):\n${params.digest.slice(0, 7000)}`,
  ].join('\n\n');
  try {
    const { object } = await generateObject({
      model: createAiProvider().chat(PATTERN_MODEL),
      schema: Result,
      schemaName: 'BehaviourPatterns',
      system: SYSTEM,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 1800,
    });
    return object.patterns.filter((p) => acceptPattern(p, params.allowedDates));
  } catch (e) {
    console.warn('[insight-patterns] llm failed', e instanceof Error ? e.message : String(e));
    return [];
  }
}
