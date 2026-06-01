/**
 * 🎯 קלסיפיקטור תגובות משתמש — מסע NuraWell
 *
 * הבעיה שהקובץ הזה פותר:
 *   "שתיתי", "שתיתי קצת", "לא הספקתי אבל ניסיתי" — 3 מצבים שונים לחלוטין
 *   שהמערכת הקודמת (regex done/miss/none) לא ידעה להבחין ביניהם.
 *
 * הפתרון: סיווג היברידי ל-7 קטגוריות.
 *   1. `done`       — בוצע מלא ("שתיתי", "עשיתי", "סיימתי 3/3").
 *   2. `partial`    — בוצע חלקית ("שתיתי קצת", "רק כוס אחת", "1 מתוך 3").
 *   3. `failed`     — ניסה ולא הצליח / שכח ("ניסיתי אבל לא הצלחתי", "שכחתי").
 *   4. `skipped`    — דילוג מודע ("לא היום", "מוותר היום").
 *   5. `opted_out`  — סירוב גורף להרגל ("אני לא רוצה את ההרגל הזה", "תוריד את זה").
 *   6. `question`   — שאלה ולא דיווח ("איך עושים?", "למה זה חשוב?").
 *   7. `unknown`    — לא ברור — האחריות חוזרת לאלמוג לשאול בעדינות.
 *
 * הזרימה:
 *   1. `classifyResponseFast` — regex מקיף שמכסה ~90% מהמקרים בלי קריאה לרשת.
 *      רץ ראשון, סינכרוני, מצליח → סיימנו.
 *   2. `classifyResponseWithLlm` — fallback לסיווג LLM זול ומהיר (Groq + LLaMA 4 Scout)
 *      כשה-regex לא הצליח לקבוע בודאות. עוטף את הקריאה עם timeout כדי שלא יתקע
 *      את `onFinish` של הצ'אט.
 *
 * עקרונות שמירת עלות:
 *   - regex *לפני* LLM. ב-90% מהמקרים לא צריך לקרוא לרשת.
 *   - LLM עם `temperature=0`, max_tokens=80, מודל זול (LLaMA 4 Scout דרך Groq).
 *   - timeout של 4 שניות — שיחה לא מחכה ל-classifier "תקוע".
 *
 * עקרונות שמירת איכות:
 *   - הסדר ב-regex: opted_out → skipped → failed → partial → question → done.
 *     זה מכוון: "שתיתי קצת" יזוהה כ-partial *לפני* שהיה נתפס כ-done סתם.
 *   - LLM מקבל את כותרת ההרגל/משימה — כך הוא יודע אם "ניסיתי" התייחס למים
 *     או להליכה (זה משנה ל-context טוב).
 */

import { z } from 'zod';

import { getClientForModel, AI_MODELS } from './client';

export type ResponseCategory =
  | 'done'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'opted_out'
  | 'question'
  | 'unknown';

export type ResponseConfidence = 'high' | 'medium' | 'low';

export type ResponseClassification = {
  category: ResponseCategory;
  confidence: ResponseConfidence;
  /** איפה הוחלט: regex (מהיר, חינם) או LLM (אמביגוויטי). */
  source: 'regex' | 'llm' | 'fallback';
  /**
   * פרט חשוב שחולץ מההודעה — לדוגמה כמות ("2 כוסות"), זמן ("בבוקר בלבד"),
   * סיבה ("היה לחוץ"). מועבר לאלמוג ככדי שיגיב ספציפית, לא בקלישאה.
   */
  extractedNote?: string;
};

/**
 * הקשר רך לקלסיפיקטור — מסייע ב-disambiguation וב-LLM prompt.
 * `itemKind` חשוב במיוחד: "ניסיתי" על הרגל מים אומר משהו אחר מאשר על הליכה.
 */
export type ResponseClassifierContext = {
  /** כותרת ההרגל/משימה ממנה צריך להבחין הסטטוס (לדוגמה: "שתיית מים"). */
  itemTitle: string;
  /** האם זה הרגל יומי או משימת מסע — משנה אובייקטים בהקשר. */
  itemKind: 'habit' | 'task';
  /** תדירות (לדוגמה "יומי", "3 פעמים ביום") — להבין מה זה "חלקי" עבורו. */
  frequencyLabel?: string;
};

/* ============================================================
 * Regex layer — מהיר, חינם, מכסה ~90% מהמקרים.
 * הסדר חשוב: כל regex רץ עד מציאה ראשונה (early return).
 * ============================================================ */

const NORMALIZE_RE = /\s+/g;
function normalize(t: string): string {
  return t.replace(NORMALIZE_RE, ' ').trim();
}

/**
 * opted_out — סירוב גורף *להרגל / משימה עצמה*, לא דילוג חד-יומי.
 *
 * דוגמאות חיוביות:
 *   ✓ "אני לא רוצה את ההרגל הזה"
 *   ✓ "תוריד לי את המשימה הזו"
 *   ✓ "זה לא מתאים לי בכלל"
 *   ✓ "לא רלוונטי לי"
 *   ✓ "מוותר על ההרגל הזה לגמרי"
 *
 * דוגמאות שליליות (לא opted_out — אלה skipped):
 *   ✗ "לא היום" → skipped
 *   ✗ "מדלג היום" → skipped
 */
const OPTED_OUT_RE =
  /(?:אני\s+לא\s+רוצה\s+(?:את\s+)?(?:ההרגל|המשימה|זה)\s+(?:הזה|הזאת)?|תוריד(?:י|ו)?\s+(?:לי\s+)?(?:את\s+)?(?:ההרגל|המשימה|זה)|זה\s+לא\s+מתאים\s+לי(?:\s+בכלל)?|לא\s+רלוונטי\s+לי|מוותר(?:ת)?\s+על\s+(?:ההרגל|המשימה)\s+(?:הזה|הזאת|לגמרי)|אני\s+פורש\s+מ(?:ההרגל|המשימה)|תפסיק(?:י|ו)?\s+(?:לבקש|להזכיר)\s+(?:לי\s+)?(?:את\s+)?(?:ההרגל|המשימה|זה))/i;

/**
 * skipped — דילוג חד-יומי מודע. "היום מדלג, מחר נראה".
 */
const SKIPPED_RE =
  /(?:לא\s+היום|מדלג(?:ת|ים)?\s+(?:היום|על\s+זה\s+היום)|מוותר(?:ת)?\s+על\s+(?:זה\s+)?היום|בוא\s+נדלג\s+היום|אקח\s+הפסקה\s+היום|פסיכי\s+לי\s+היום|לא\s+(?:אעשה|אשתה)\s+(?:את\s+זה\s+)?היום|day\s*off)/i;

/**
 * failed — ניסה ולא הצליח / שכח / נקטע. *מאמץ* יש, ביצוע אין.
 *
 * הניואנס: "לא הספקתי" לחוד הוא בעיקר אילוץ זמן — אם מצורף "אבל ניסיתי"
 * זה failed; בלי "ניסיתי" זה יכול להיות סתם miss רגיל. כאן אנחנו מתפסים
 * את שני המקרים כ-failed כדי לתת תגובה תומכת.
 */
const FAILED_RE =
  /(?:ניסיתי(?:\s+אבל)?\s+(?:לא\s+(?:הצלחתי|הספקתי)|לא\s+יצא)|השתדלתי(?:\s+אבל)?\s+לא|כמעט\s+הצלחתי\s+אבל|התחלתי\s+אבל\s+(?:לא\s+(?:סיימתי|יכולתי|הגעתי|הצלחתי)|נשבר)|שכחתי\s+(?:לשתות|לעשות|לבצע|את\s+ה)|לא\s+הספקתי\s+אבל\s+ניסיתי|לא\s+הצלחתי\s+(?:להגיע|לעשות|לבצע)|נשבר\s+לי|פאשלתי|כשלון|רציתי\s+אבל\s+לא\s+(?:יצא|הצלחתי)|נפלתי\s+אבל)/i;

/**
 * partial — בוצע חלקית. יש פעולה אמיתית, אבל לא מלאה.
 *
 * דוגמאות:
 *   ✓ "שתיתי קצת"
 *   ✓ "שתיתי רק כוס אחת"
 *   ✓ "עשיתי 1 מתוך 3"
 *   ✓ "הצלחתי חצי"
 *   ✓ "התחלתי אבל לא הגעתי לסוף"
 *
 * החשוב: הביטוי *מצורף* לפעולה. "קצת" לחוד הוא לא partial — אבל
 * "שתיתי קצת" כן. לכן ה-regex דורש *הופעה משולבת*.
 */
const PARTIAL_QUANTIFIERS_RE =
  /(?:קצת|מעט|חצי|רק\s+(?:פעם\s+אחת|אחת|פעמיים|כוס\s+אחת|אחד|שתיים)|חלקית|לא\s+הכל|חלק|רק\s+\d+(?:\s+מתוך\s+\d+)?|\d+\s+מתוך\s+\d+|לא\s+במלואו|לא\s+לגמרי)/i;

const PARTIAL_ACTIONS_RE =
  /(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סיימתי|הצלחתי|אכלתי|הלכתי|התחלתי|זרמתי)/i;

/**
 * question — שאלה ברורה ולא דיווח.
 *
 * תפסים:
 *   ✓ "איך עושים את זה?"
 *   ✓ "למה זה חשוב?"
 *   ✓ "מה ההמלצה?"
 *   ✓ "מתי כדאי?"
 *   ✓ "האם זה חייב להיות בבוקר?"
 *
 * לא תופס דיווח שמסתיים בסימן שאלה רטורי ("שתיתי כבר?").
 */
const QUESTION_OPENER_RE =
  /^\s*(?:איך|למה|מה(?:\s+ה|\s+זה|\s+כדאי|\s+ההמלצה|\s+ההבדל)|מתי(?:\s+כדאי|\s+אני)?|האם|למי|מי|איפה|כמה(?:\s+פעמים|\s+מים)?|לאיזה)/i;

/**
 * done — בוצע מלא. *אחרון בסדר* כדי שלא יבלע "שתיתי קצת" (partial).
 *
 * המגבלה: `done` רק כשאין אחריו quantifier של חלקיות. ה-negative lookahead
 * `(?!\s+(?:קצת|מעט|חצי|רק))` הוא מה שמבדיל "שתיתי" מ-"שתיתי קצת".
 */
const DONE_ACTION_RE =
  /(?:^|[\s.,!])(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|סגרתי|בוצע|כבר\s+עשיתי|כן\s+עשיתי|נעשה|אכלתי|הלכתי)(?!\s+(?:קצת|מעט|חצי|רק|חלק|חלקית|\d))/i;

const SHORT_AFFIRMATIVE_RE = /^(?:כן|✅|✓|נעשה|done|בוצע|סגור|אלוף)\s*[!.?]*\s*$/i;

/**
 * מסווג מהיר, סינכרוני, בלי רשת. החזרת `null` = לא בטוח, צריך לעבור ל-LLM.
 */
export function classifyResponseFast(userMessage: string): ResponseClassification | null {
  const t = normalize(userMessage);
  // אורך מינימלי 1 כדי לתפוס אימוג'ים בודדים כמו "✅".
  if (t.length < 1) return null;

  if (OPTED_OUT_RE.test(t)) {
    return { category: 'opted_out', confidence: 'high', source: 'regex' };
  }

  if (SKIPPED_RE.test(t)) {
    return { category: 'skipped', confidence: 'high', source: 'regex' };
  }

  if (FAILED_RE.test(t)) {
    return { category: 'failed', confidence: 'high', source: 'regex' };
  }

  if (PARTIAL_QUANTIFIERS_RE.test(t) && PARTIAL_ACTIONS_RE.test(t)) {
    const quantMatch = t.match(PARTIAL_QUANTIFIERS_RE);
    const note = quantMatch?.[0]?.trim();
    return {
      category: 'partial',
      confidence: 'high',
      source: 'regex',
      ...(note ? { extractedNote: note } : {}),
    };
  }

  if (QUESTION_OPENER_RE.test(t) || /\?\s*$/.test(t)) {
    if (!PARTIAL_ACTIONS_RE.test(t) || /\?\s*$/.test(t)) {
      return { category: 'question', confidence: 'medium', source: 'regex' };
    }
  }

  if (SHORT_AFFIRMATIVE_RE.test(t) || DONE_ACTION_RE.test(t)) {
    return { category: 'done', confidence: 'high', source: 'regex' };
  }

  return null;
}

/* ============================================================
 * LLM layer — fallback לאמביגוויטי. Groq + LLaMA 4 Scout.
 * ============================================================ */

const llmClassificationSchema = z.object({
  category: z.enum(['done', 'partial', 'failed', 'skipped', 'opted_out', 'question', 'unknown']),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  extracted_note: z.string().max(120).nullable().optional(),
});

const CLASSIFIER_TIMEOUT_MS = 4000;
const CLASSIFIER_MAX_TOKENS = 80;

function buildLlmPrompt(userMessage: string, ctx: ResponseClassifierContext): string {
  const kindHe = ctx.itemKind === 'habit' ? 'הרגל' : 'משימה';
  const frequency = ctx.frequencyLabel ? `\nתדירות ${kindHe}: ${ctx.frequencyLabel}` : '';
  return `אתה מסווג תגובת משתמש לתזכורת ${kindHe}.
כותרת ${kindHe}: "${ctx.itemTitle}"${frequency}

הודעת המשתמש: "${userMessage.slice(0, 400)}"

בחר *קטגוריה אחת בלבד*:
- "done"      → ביצוע מלא ("שתיתי", "סיימתי 3/3", "עשיתי הכל").
- "partial"   → ביצוע חלקי ("שתיתי קצת", "רק כוס אחת", "הצלחתי 1 מתוך 3").
- "failed"    → ניסה ולא הצליח / שכח / נכשל ("שכחתי", "ניסיתי אבל לא יצא").
- "skipped"   → דילוג מודע *היום* ("לא היום", "מוותר היום").
- "opted_out" → סירוב גורף *להרגל עצמו* ("אני לא רוצה את ההרגל הזה", "תוריד את זה").
- "question"  → שאלה ולא דיווח ("איך עושים?", "למה זה חשוב?").
- "unknown"   → לא ברור / נושא אחר לחלוטין.

החזר JSON תקין בלבד, בלי טקסט נוסף:
{"category":"<קטגוריה>","confidence":"<high|medium|low>","extracted_note":"<פרט קצר אם רלוונטי, אחרת null>"}`;
}

/**
 * LLM fallback. תמיד מחזיר תוצאה — גם אם יש שגיאת רשת — כדי שהצ'אט
 * לא ייתקע. במצב כשל החזרת `unknown` עם source='fallback' מאפשרת לזרימה
 * הראשית להתאושש בלי לדגום DB.
 */
export async function classifyResponseWithLlm(
  userMessage: string,
  ctx: ResponseClassifierContext
): Promise<ResponseClassification> {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) {
    return { category: 'unknown', confidence: 'low', source: 'fallback' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const groqClient = getClientForModel('background_groq');
    const completion = await groqClient.chat.completions.create(
      {
        model: AI_MODELS.background_groq,
        temperature: 0,
        max_tokens: CLASSIFIER_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'אתה מסווג תגובות משתמש בעברית. החזר JSON בלבד עם השדות שמבקשים.',
          },
          { role: 'user', content: buildLlmPrompt(userMessage, ctx) },
        ],
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { category: 'unknown', confidence: 'low', source: 'fallback' };
    }

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = llmClassificationSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      return { category: 'unknown', confidence: 'low', source: 'fallback' };
    }

    return {
      category: parsed.data.category,
      confidence: parsed.data.confidence,
      source: 'llm',
      ...(parsed.data.extracted_note
        ? { extractedNote: parsed.data.extracted_note.slice(0, 120) }
        : {}),
    };
  } catch {
    return { category: 'unknown', confidence: 'low', source: 'fallback' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ============================================================
 * Public API — `classifyResponse` הוא הפונקציה הראשית שכל הצ'אט יקרא לה.
 * ============================================================ */

export type ClassifyResponseOptions = {
  /**
   * אם `true`, ידלג על ה-LLM ויחזיר את תוצאת ה-regex או `unknown`.
   * שימושי בנתיב הביצוע הסינכרוני שלפני הזרמת התשובה לצ'אט (כדי שהפרומפט
   * ייבנה מיד, בלי לחכות לרשת חיצונית).
   */
  skipLlm?: boolean;
};

/**
 * המנגנון הראשי. *תמיד* מחזיר תוצאה (גם בכשל). לא יזרוק שגיאות —
 * זו חלק מהזרימה הקריטית של הצ'אט.
 *
 * זרימה:
 *   1. regex (סינכרוני, חינם, ~90% של המקרים) → אם high confidence, סיימנו.
 *   2. אם skipLlm → החזרת `unknown` עם source='regex' (נופל יפה ל-AI).
 *   3. LLM (Groq, ~200-500ms, אגורות) → סיווג סופי.
 */
export async function classifyResponse(
  userMessage: string,
  ctx: ResponseClassifierContext,
  opts?: ClassifyResponseOptions
): Promise<ResponseClassification> {
  const fast = classifyResponseFast(userMessage);
  if (fast && fast.confidence === 'high') return fast;

  if (opts?.skipLlm) {
    return fast ?? { category: 'unknown', confidence: 'low', source: 'regex' };
  }

  return classifyResponseWithLlm(userMessage, ctx);
}

/**
 * דאוטה-מאפינג מהקטגוריה ל-`outcome` ב-`journey_task_executions`.
 *  - done       → completed
 *  - partial    → partial            (חדש; דורש מיגרציה להרחיב CHECK)
 *  - failed     → attempt_failed     (קיים כבר ב-DB)
 *  - skipped    → skipped            (חדש; דורש מיגרציה להרחיב CHECK)
 *  - opted_out  → לא נכתב לטבלת executions; מטופל ב-habit_meta בנפרד.
 *  - question   → לא נכתב.
 *  - unknown    → לא נכתב.
 */
export type TaskExecutionOutcomeFromCategory =
  | 'completed'
  | 'partial'
  | 'attempt_failed'
  | 'skipped';

export function outcomeFromCategory(
  category: ResponseCategory
): TaskExecutionOutcomeFromCategory | null {
  switch (category) {
    case 'done':
      return 'completed';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'attempt_failed';
    case 'skipped':
      return 'skipped';
    default:
      return null;
  }
}

/** האם הקטגוריה מהווה דיווח שמשנה את ה-DB? */
export function isReportingCategory(category: ResponseCategory): boolean {
  return (
    category === 'done' ||
    category === 'partial' ||
    category === 'failed' ||
    category === 'skipped' ||
    category === 'opted_out'
  );
}
