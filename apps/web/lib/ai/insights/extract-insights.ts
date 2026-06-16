/**
 * מנוע חילוץ התובנות — שכבת ה-LLM (רקע, לא צ'אט).
 *
 * מקבל תמלול של תור-שיחה אחרון + התובנות הקיימות של המשתמש, ומחזיר מערך תובנות
 * מובנה ומאומת (Zod). משתמש ב-AI SDK `generateObject` כדי לקבל פלט מבני אמין,
 * מול GPT-5 mini דרך OpenRouter (AI_MODELS.empathy).
 *
 * פרטיות: הקובץ הזה הוא server-only. אסור לייבא אותו מקוד client — קריאת ה-LLM
 * חייבת לרוץ בשרת בלבד (המפתח וה-PII לא נחשפים לדפדפן).
 */

import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';

import { AI_MODELS } from '../client';
import { publicAppUrlForAiReferer } from '../../public-app-url';
import { EMPTY_EXTRACTION, InsightExtractionResult, type ExtractedInsight } from './schema';

/** סף ביטחון מינימלי — תובנות חלשות מזה נזרקות (מניעת רעש). */
const MIN_CONFIDENCE = 0.55;

/** ספק OpenRouter דרך AI SDK (אותו base-url של ה-`openrouter` הקיים ב-client.ts). */
const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY?.trim() || 'build-placeholder-key',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

/**
 * הפרומפט הרקעי. ממצב את המודל כפסיכולוג התנהגותי מומחה שמחפש *אותות עומק*,
 * מתעלם מפטפוט, ומחזיר רק דאטה בעלת-ערך — כולל "מה חסר לנו לדעת".
 */
const EXTRACTION_SYSTEM = `אתה פסיכולוג התנהגותי מומחה ומאמן הרגלים, שעובד ברקע עבור NuraWell.
המשימה שלך: לקרוא קטע משיחה בין משתמש למנטור, ולחלץ תובנות *אישיות ובנות-פעולה* שיעזרו למנטור לעזור למשתמש לצמוח. אתה לא מדבר עם המשתמש — אתה רק מנתח.

מה לחלץ (רק ערך גבוה — איכות על פני כמות):
- preference: העדפות *סמויות* שהמשתמש לא ציין במפורש אך משתמעות מהתנהגותו ("מתקשה עם שגרת בוקר", "מעדיף אימונים קצרים").
- blocker: נקודות חיכוך וחסמים מנטליים (פחד מכישלון, פרפקציוניזם, עומס, אכילה רגשית).
- goal: יעדים מיידיים או ארוכי-טווח שעולים מהשיחה.
- fitness / nutrition / mental: תובנות תוכן ספציפיות בתחומים אלה.
- missing_info: ⭐ נתונים *חסרים* שיעזרו למנטור לתת ליווי טוב יותר — מה המנטור צריך לברר בעדינות בשיחות הבאות (למשל: שעות שינה, רמת לחץ בעבודה, מערכת תמיכה). לכל missing_info הוסף probe_question — ניסוח רך, סקרני ולא-חודרני שאפשר לשזור בשיחה.

חוקי ברזל:
- ⛔ התעלם מפטפוט טריוויאלי (ברכות, סמול-טוק, "תודה", "אוקיי"). אם אין אות עומק — החזר insights ריק.
- ⛔ אל תמציא. חלץ רק מה שנתמך ע"י השיחה בפועל. צרף evidence קצר מהשיחה.
- אל תשכפל תובנה שכבר קיימת (תינתן לך רשימת "תובנות קיימות"). אם תובנה קיימת *התעדכנה/התחדדה* — החזר אותה בניסוח המעודכן והמדויק ביותר; אל תייצר וריאציה כפולה.
- actionability_score: 1 = הקשר טריוויאלי, 10 = מנוף שינוי ישיר שהמנטור יכול לפעול עליו מיד. דרג בכנות.
- confidence: עד כמה אתה בטוח שהתובנה נכונה (0..1).
- כתוב insight_text ו-probe_question בעברית, קצר וחד.`;

/** בונה את בלוק "התובנות הקיימות" כדי שהמודל ימזג במקום לשכפל. */
function formatExistingInsights(existing: { category: string; insight_text: string }[]): string {
  if (!existing.length) return 'אין תובנות קיימות עדיין.';
  return existing
    .slice(0, 30)
    .map((i) => `- [${i.category}] ${i.insight_text}`)
    .join('\n');
}

export interface ExtractInsightsParams {
  /** תמלול תור-השיחה (כבר מפורמט: "משתמש: ...\nמנטור: ..."). */
  transcript: string;
  /** התובנות הפעילות הקיימות של המשתמש — למיזוג ומניעת כפילויות. */
  existingInsights?: { category: string; insight_text: string }[];
}

/**
 * מריץ את חילוץ התובנות. תמיד מחזיר תוצאה תקפה (גם ריקה) — לעולם לא זורק, כדי
 * שתהליך-הרקע שמפעיל אותו לא ייפול בגלל כשל LLM/רשת.
 */
export async function extractInsights(
  params: ExtractInsightsParams
): Promise<InsightExtractionResult> {
  const transcript = params.transcript.trim();
  if (transcript.length < 20) return EMPTY_EXTRACTION;
  if (!process.env.OPENROUTER_API_KEY?.trim()) return EMPTY_EXTRACTION;

  const userContent = [
    `תובנות קיימות על המשתמש (אל תשכפל; חדד אם השתנו):\n${formatExistingInsights(
      params.existingInsights ?? []
    )}`,
    `קטע השיחה לניתוח:\n${transcript.slice(0, 6000)}`,
  ].join('\n\n');

  try {
    const { object } = await generateObject({
      // `.chat(...)` מכריח את Chat Completions API (מה ש-OpenRouter תומך בו),
      // בדיוק כמו שאר המסלולים בקוד. קריאה ישירה עלולה לפנות ל-Responses API.
      model: openrouterProvider.chat(AI_MODELS.empathy),
      schema: InsightExtractionResult,
      schemaName: 'UserInsights',
      schemaDescription: 'תובנות אישיות ובנות-פעולה שחולצו משיחת המשתמש.',
      system: EXTRACTION_SYSTEM,
      prompt: userContent,
      temperature: 0.2,
      maxOutputTokens: 1500,
    });

    // סינון רעש: מתחת לסף הביטחון לא נשמר.
    const insights = object.insights.filter(
      (i: ExtractedInsight) => i.confidence >= MIN_CONFIDENCE
    );
    return { insights };
  } catch {
    // כשל LLM/רשת/אימות — נשארים עם תוצאה ריקה; הצ'אט עצמו לא נפגע.
    return EMPTY_EXTRACTION;
  }
}
