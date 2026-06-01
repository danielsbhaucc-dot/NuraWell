/**
 * זיהוי תגובת משתמש על הרגל יומי — *7 קטגוריות מלאות*, לא רק done/miss.
 *
 * שדרוג מהפרויקט המקורי:
 *   הגרסה הישנה (regex done/miss/none) בלעה ניואנס:
 *     "שתיתי"            → done   ✓
 *     "שתיתי קצת"        → done   ✗ (היה צריך partial)
 *     "ניסיתי אבל לא"   → miss   ✗ (היה צריך failed)
 *     "אני לא רוצה את ההרגל" → none ✗ (היה צריך opted_out)
 *
 *   הגרסה הזו משתמשת ב-`classifyResponseFast` הסינכרוני מ-`response-classifier.ts`
 *   שמחזיר את הקטגוריה המלאה. אם ה-regex לא בטוח, נשאר `null` והקריאה הראשית
 *   יכולה לבחור אם לעלות ל-LLM (`classifyResponse` עם async).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  classifyResponseFast,
  type ResponseCategory,
  type ResponseClassification,
} from './response-classifier';
import { markHabitForUser, optOutHabitForUser } from './micro-win-habit';

/** טיפוס לתאימות לאחור עם קוד שמשתמש ב-HabitIntentKind. */
export type HabitIntentKind = 'done' | 'miss' | 'none';

export type HabitIntentDetection = {
  kind: HabitIntentKind;
  /** קטגוריה מלאה לפי הסיווג החדש (לקוד שמשתמש בכל 7 הקטגוריות). */
  category: ResponseCategory;
  /** בטחון הסיווג — שימושי כדי להחליט אם לעלות ל-LLM. */
  confidence: ResponseClassification['confidence'];
  /** איפה הוחלט (regex/llm/fallback) — לדיבאג ולוגים. */
  source: ResponseClassification['source'];
  habitId?: string;
  habitTitle?: string;
  extractedNote?: string;
};

const WATER_HABIT_TITLE_RE = /מים|שתייה|לשתות|רטוב/i;

function normalizeMsg(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function habitTitleKeywords(title: string): string[] {
  return title
    .split(/[\s,·\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function messageReferencesHabit(msg: string, title: string): boolean {
  if (WATER_HABIT_TITLE_RE.test(title) && /מים|שתי|לשתות/i.test(msg)) return true;
  const kws = habitTitleKeywords(title);
  if (kws.length === 0) return false;
  return kws.some((kw) => msg.includes(kw));
}

/** ממפה את 7 הקטגוריות ל-3 הישנות לצורך תאימות לאחור. */
function categoryToLegacyKind(category: ResponseCategory): HabitIntentKind {
  switch (category) {
    case 'done':
      return 'done';
    case 'partial':
    case 'failed':
    case 'skipped':
    case 'opted_out':
      return 'miss';
    case 'question':
    case 'unknown':
    default:
      return 'none';
  }
}

/** @deprecated — השתמש ב-detectHabitIntent */
export function detectWaterHabitCompletionIntent(userMessage: string): boolean {
  return detectHabitIntent(userMessage, []).category === 'done';
}

/**
 * מזהה תגובת משתמש על הרגל. תוצאה תמיד נחזרת — אם הקטגוריה לא ברורה
 * וההודעה לא מתייחסת להרגל מוכר, המצב הוא `category='unknown'` ו-`kind='none'`.
 *
 * זרימה:
 *   1. `classifyResponseFast` נותן קטגוריה מלאה (אם regex מבחין).
 *   2. אם הקטגוריה מהווה דיווח, מצמידים אותה להרגל מתאים ברשימה.
 *   3. אם אין רשימת הרגלים — נופלים לזיהוי "מים" גנרי (legacy fallback).
 */
export function detectHabitIntent(
  userMessage: string,
  habits: Array<{ id: string; title: string }>
): HabitIntentDetection {
  const msg = normalizeMsg(userMessage);
  if (msg.length < 3) {
    return { kind: 'none', category: 'unknown', confidence: 'low', source: 'regex' };
  }

  const classification = classifyResponseFast(msg);
  if (!classification) {
    return { kind: 'none', category: 'unknown', confidence: 'low', source: 'regex' };
  }

  const category = classification.category;
  const kind = categoryToLegacyKind(category);

  // קטגוריות שלא קשורות להרגל ספציפי — מחזירים בלי habitId.
  if (category === 'question' || category === 'unknown') {
    return {
      kind: 'none',
      category,
      confidence: classification.confidence,
      source: classification.source,
      ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
    };
  }

  // אם יש רשימת הרגלים — חפש איזה הרגל מוזכר בהודעה.
  if (habits.length > 0) {
    for (const h of habits) {
      if (messageReferencesHabit(msg, h.title)) {
        return {
          kind,
          category,
          confidence: classification.confidence,
          source: classification.source,
          habitId: h.id,
          habitTitle: h.title,
          ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
        };
      }
    }

    // אם זוהה דיווח על מים אבל הכותרת לא מצאה התאמה — fallback למים אם קיים.
    if (WATER_HABIT_TITLE_RE.test(msg)) {
      const water = habits.find((h) => WATER_HABIT_TITLE_RE.test(h.title));
      if (water) {
        return {
          kind,
          category,
          confidence: classification.confidence,
          source: classification.source,
          habitId: water.id,
          habitTitle: water.title,
          ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
        };
      }
    }

    /**
     * 🎯 disambiguation למקרה היחיד — אם יש בדיוק הרגל אחד פעיל וקטגוריה
     * ברורה (לא question/unknown), בטוח להניח שהמשתמש מתכוון אליו.
     * זה במיוחד חשוב ל-opted_out: "אני לא רוצה את ההרגל הזה" *חייב* שיוצמד
     * להרגל ספציפי כדי שנוכל לכבות אותו.
     */
    if (habits.length === 1 && classification.confidence !== 'low') {
      const only = habits[0]!;
      return {
        kind,
        category,
        confidence: classification.confidence,
        source: classification.source,
        habitId: only.id,
        habitTitle: only.title,
        ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
      };
    }

    // קטגוריה ברורה (done/partial/failed/skipped/opted_out) אבל אין הרגל מוכר.
    // עדיין שווה להחזיר את הקטגוריה כדי שה-AI ידע לדבר בטון מתאים.
    return {
      kind: 'none',
      category,
      confidence: 'low',
      source: classification.source,
      ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
    };
  }

  // אין רשימת הרגלים — fallback לזיהוי "מים" גנרי.
  if (WATER_HABIT_TITLE_RE.test(msg)) {
    return {
      kind,
      category,
      confidence: classification.confidence,
      source: classification.source,
      habitTitle: 'מים',
      ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
    };
  }

  return {
    kind: 'none',
    category,
    confidence: 'low',
    source: classification.source,
    ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
  };
}

/**
 * מבצע את ה-side effect המתאים על ה-DB לפי הקטגוריה שזוהתה:
 *
 *   done       → markHabitForUser  (מסמן ✓ בהרגל היומי הנוכחי)
 *   opted_out  → optOutHabitForUser (מסמן ב-habit_meta שהמשתמש לא רוצה)
 *   partial    → לא נכתב כרגע ב-habits_progress הבינארי; ה-AI ידבר על זה
 *                ולא נסמן V (כי המשתמש לא סיים). אם בעתיד ירצו להיסטוריה
 *                של partial על הרגל — נוסיף שדה ל-habit_meta.
 *   failed     → לא נכתב; ה-AI נותן תמיכה.
 *   skipped    → לא נכתב; ה-AI מכיל ומחזיר למחר.
 *   question / unknown → לא נכתב.
 *
 * החזרה תמיד כוללת את ה-`intent` המלא — גם אם לא היה side effect — כדי
 * שהקוד הקורא יוכל לדעת מה לעשות בפרומפט.
 */
export async function applyHabitIntentFromUserMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  habits: Array<{ id: string; title: string }> = []
): Promise<{
  marked: boolean;
  optedOut: boolean;
  habitTitle?: string;
  intent: HabitIntentDetection;
}> {
  const intent = detectHabitIntent(userMessage, habits);

  if (intent.category === 'done') {
    const result = await markHabitForUser(supabase, userId, intent.habitId);
    if (!result.ok) {
      return { marked: false, optedOut: false, intent };
    }
    return {
      marked: true,
      optedOut: false,
      habitTitle: result.habitTitle,
      intent: { ...intent, habitId: result.habitId, habitTitle: result.habitTitle },
    };
  }

  if (intent.category === 'opted_out') {
    if (!intent.habitId) {
      return { marked: false, optedOut: false, intent };
    }
    const result = await optOutHabitForUser(supabase, userId, intent.habitId);
    return {
      marked: false,
      optedOut: result.ok,
      habitTitle: intent.habitTitle,
      intent,
    };
  }

  // partial / failed / skipped / question / unknown — לא נכתב ל-DB,
  // אבל מחזירים את ה-intent כדי שה-AI ייתן תגובה מתאימה.
  return { marked: false, optedOut: false, intent };
}
