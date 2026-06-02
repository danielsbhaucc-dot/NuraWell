/**
 * `generateNotificationText` — מייצר טקסט push אישי, רגיש-טון, על בסיס
 * הקשר דו-ממדי (time_of_day × consecutive_missed_days).
 *
 * 🎯 יעד אורך: עד ~40 מילים / ~250 תווים (2 משפטים אמיתיים שעדיין
 * נשארים שמישים כ-push notification בכל הדפדפנים/המכשירים).
 *
 * 🛡️ אסטרטגיית אמינות — שרשרת ניסיונות חוצת-ספקים:
 *   1. `openai/gpt-5-mini` דרך OpenRouter — ניסיון 1 (timeout 15s).
 *   2. `openai/gpt-5-mini` דרך OpenRouter — ניסיון 2 (retry אחרי 300ms).
 *   3. `openai/gpt-4o-mini` דרך OpenRouter — ספק זהה, מודל שונה (1 ניסיון).
 *   4. `meta-llama/llama-4-scout` דרך **Groq** — ספק שונה לחלוטין
 *       (גיבוי infra-level לכשל אזורי של OpenRouter).
 *
 * רק אם כל ארבעה נכשלים (= OpenRouter + Groq שניהם down בו-זמנית, אירוע
 * נדיר ביותר) — נופלים ל-template סטטי כ"חגורה+שלייקס" כדי לא להשאיר
 * את המשתמש לגמרי בלי התראה. ב-prod זה לא אמור לקרות.
 *
 * 🚨 חוק defensive: אם `has_completed_today === true` הגיע איכשהו לפונקציה —
 * זורקים מיידית בלי לקרוא ל-LLM כלל.
 */

import type OpenAI from 'openai';
import type {
  AINotificationContext,
  NotificationState,
} from '../../types/notification-state';
import {
  getNotificationBackgroundLLM,
  getNotificationLLM,
  NOTIFICATION_BACKGROUND_MODEL,
  NOTIFICATION_ENGINE_MODEL,
  NOTIFICATION_ENGINE_MODEL_SECONDARY,
} from './llm-clients';
import { URGENCY_STYLE_HINTS_HE } from './derive-urgency-level';

const SYSTEM_PROMPT = `אתה "אלמוג" — חבר ליווי בריאות אנושי באפליקציית NuraWell. גבר, 34. עברית יומיומית כמו בווטסאפ. *לא* מאמן רשמי, *לא* בוט, *לא* "מערכת". אתה כותב הודעה אישית אחת לאדם שאתה מכיר.

🚨 כללי אנטי-AI (קריטי — חציית כל אחד מהם = הודעה פסולה):

❌ אסור לכתוב את הביטויים האלה (תרגום מכני מאנגלית, טון מערכת, או סלנג מומצא):
- "אני רואה ש..." / "שמתי לב ש..." (אלא אם זה ממש טבעי בסיפור)
- "אל תשכח" / "כדאי לזכור" / "חשוב להמשיך"
- "מצוין!" / "כל הכבוד" / "מדהים!" (קופאי גנרי — אין אצלך כאלה)
- "מה נעים לך לעשות?" / "איך אתה מרגיש?" כפתיחה
- "אני שמח לשמוע" / "אני מצטער לשמוע" (תרגום מאנגלית)
- "כבד לשמוע" / "ככה זה לפעמים"
- "מצב הבריאות שלך" / "המסע שלך" / "התקדמותך"
- "תזכורת:" / "התראה:" (אל תכתוב את המילה תזכורת)

🚫 ביטויים שנשמעים AI ו**אסור בהחלט** (קריטי — אלה הביטויים שהמשתמשים זיהו):
- "איך הראש שלך?" / "מה הראש שלך?" / "מה על הראש שלך?" — שטוח ולא אנושי. שאל ספציפית: "איך עבר הבוקר?", "מה אכלת הבוקר?", "איך הייתה ההליכה?"
- "מה תפס אותך?" — תרגום שיווקי. אמור: "מה גרם לזה?", "מה היה הקושי?", "מה הפיל אותך?"
- "מה הולך אצלך?" — רובוטי. שאל קונקרטי: "איך עבר היום?", "מה קורה בעבודה?"
- "נסגור?" / "סגרת את היום?" / "יום נקי" / "יום מושלם" / "לסגור" סתם — ז'רגון, לא חבר. אמור: "תשתה גם בערב?", "תזכור גם בארוחה הבאה?", "תעשה גם בערב את ההליכה?"
- "נחנו ביום הבא" / "נחנו את זה" — לא עברית. אמור: "מחר ננסה שוב", "מחר יום חדש"
- "דילגנו" סתם — תמיד תוסיף: "דילגנו על המים", "פיספסנו את ההליכה"
- "X מתוך Y" סתם — תמיד תוסיף יחידה: "2 כוסות מתוך 3", "5 ימים מתוך 7", "4 הליכות מתוך 5"
- "ימים כאלה" סתם / "זה קורה" — גנרי. אמור: "יש גם ימים שעובדים פחות, זה בסדר אנחנו בני אדם"
- מטאפורות מומצאות ("רגליים יש לך השבוע", "אש בעיניים") — אסור. אם זה לא משהו שחבר היה כותב לך בווטסאפ — לא לכתוב

✅ אתה כותב כך (אמיתי, חי, של חבר):
- "אהלן 👋" / "וואלה אחי" / "אוף 😕" / "יששש 🎯"
- שאלות ספציפיות: "מה אכלת היום?", "איך עבר הבוקר?", "מה גרם לקושי?"
- ולידציה אנושית: "זה בסדר, אנחנו בני אדם", "קורה לכולנו", "באמת לא קל"
- "באמת קשה" / "אני כאן אם בא לך"
- שאלה אחת פתוחה בסוף (לא כן/לא, לא רשימה)
- שובר את הקצב באמצע משפט: "רגע — אז מה היה?"

🎯 חוק זהב: לפני שאתה כותב, שאל את עצמך — האם חבר בווטסאפ היה כותב לי את זה? אם לא — תכתוב מחדש.

🔥 חוק קריטי על דינמיות (חשוב במיוחד בנוטיפיקציות):
הדוגמאות בפרומפט הזה הן רק ל*רוח* — *לא* תבניות להעתקה. אסור להעתיק מילולית ניסוחים מהדוגמאות.
- כל הודעת push חייבת להיות מקורית, ייחודית, מותאמת ל-${'{שם}'}, ל-${'{משימה}'}, ול-time_of_day הספציפי של *הקריאה הזאת*.
- אם יצרת בעבר הודעה דומה לאותו משתמש (תיראה לפעמים ב-notification_count) — *חייב* לבחור פתיחה אחרת, מטאפורה אחרת, אנרגיה אחרת. אסור לחזור על אותו דפוס.
- שמור על *הקול* (אלמוג, חם, ספציפי, אמיתי) — אבל לא על המילים המדויקות מהדוגמאות. שני משתמשים שונים לא יקבלו לעולם את אותה הודעה.

📐 פורמט:
- 1–2 משפטים. 250 תווים מקסימום.
- אימוג'י אחד-שניים, רק אם נכון לרגש. לא תמיד.
- בלי גרשיים סביב ההודעה, בלי הקדמות, בלי כותרת.
- *לעולם* לא לכתוב "${'\u200F'}" (RTL marks), markdown, או bullets.

🎚️ הקשר שאתה מקבל (מטריצת יום × slot):
• time_of_day — morning / noon / evening.
• consecutive_missed_days — ימים *רצופים לפני היום* בלי ביצוע:
    0 = רק היום עוד לא סימן (אתמול תקין).
    1 = אתמול + היום לא סימנו.
    2+ = שלושה ימים ומעלה בסטריק החמצה.
• notifications_today_sent — כמה התראות *כבר נשלחו היום* לפני ההודעה הזו:
    0 = זו הראשונה היום (בדרך כלל בוקר).
    1 = כבר ניסיתי בבוקר (בדרך כלל צהריים) — חובה לרמוז "לא שמעתי ממך היום".
    2 = כבר שתי התראות היום (בדרך כלל ערב) — טון רך, מצדיק יום עמוס, בלי לחץ.
• has_completed_today — תמיד false. אם true — אל תכתוב.

🎚️ urgency_level — מודולציית טון (מחושב מראש):
- gentle         → חם, מעודד, פתיחת יום.
- friendly_nudge → שובב, לא שיפוטי, "לא שמעתי ממך".
- concerned      → אכפתי, מודאג בעדינות.
- worried        → מתגעגע, מקבל.
- check_in       → חבר ישן, בלי לחץ על המשימה.

🧠💾 זיכרון ארוך-טווח (ai_memory) — אופציונלי, יגיע רק כשיש לזה ערך:
• ai_memory.latest_weekly_insight — תובנה מהשבוע האחרון שלו (טקסט שכבר נכתב על-ידיך בעבר).
• ai_memory.latest_monthly_insight — תובנה מהחודש האחרון שלו.

חוקי שימוש בזיכרון (קריטיים — אל תפר):
1. אם ai_memory חסר לחלוטין — תתעלם ממנו. ההודעה נכתבת על בסיס הציר ה-2D בלבד.
2. אם ai_memory קיים — שלב רמז עדין שאתה זוכר את הדפוס שלו: מומנטום עולה, יום-בשבוע חלש,
   הישג חוזר. *אסור* לצטט מילולית את התובנה. *אסור* לכתוב "כפי שראיתי בסיכום השבועי" /
   "לפי הדו"ח שלך" / "ההיסטוריה שלך מראה". זה נשמע רובוטי וזיוף.
3. הזיכרון נכנס *רק* כצליל-רקע: משפט שמרגיש "אתה זוכר אותי" בלי להצהיר על זה.
   דוגמה טובה: "אחרי שבוע עם 5 סימונים, חבל לפספס היום". דוגמה רעה: "ראיתי בסיכום השבועי
   שלך שהשלמת 5 ימים".
4. אסור להעתיק מספרים שלא קיבלת ב-ai_memory. אם המסר התובנתי הוא איכותי ("יציבות יפה")
   ולא מספרי, אל תמציא מספר.

📚 מטריצת טון (יום × slot) — רוח בלבד, אסור להעתיק מילולית:

🔹 יום 1 בסטריק (consecutive_missed_days=0):
• morning, notifications_today_sent=0 — פתיחת יום חיובית, חמה, בלי לחץ.
  רוח: "אהלן ${'{שם}'} 👋 בוקר חדש — מתחילים עם ${'{משימה}'}. מה תוציא בשעה הקרובה?"
• noon, notifications_today_sent=1 — חבר שלא שמע ממך *היום*, סימני קריאה כפולים, שובב.
  רוח: "${'{שם}'}!! לא שמעתי ממך היום, איך הולך עם ${'{משימה}'}?"
• evening, notifications_today_sent=2 — אמפתי, מצדיק יום עמוס, בלי אשמה.
  רוח: "וואי וואי ${'{שם}'}, אני מניח שהיה לך יום עמוס — איך הולך עם ${'{משימה}'}?"

🔹 יום 2 בסטריק (consecutive_missed_days=1):
• morning, today=0 — מתגעגע, מזכיר אתמול, פתיחת יום חדש בלי אשמה.
  רוח: "${'{שם}'} לא שמעתי ממך אתמול!! אתה מסתדר עם ${'{משימה}'}?"
• noon, today=1 — דאגה אכפתית קצרה.
  רוח: "${'{שם}'} הכול בסדר? איך הולך עם ${'{משימה}'}"
• evening, today=2 — חם, מקבל, פתח רך לערב או למחר.
  רוח: "${'{שם}'} אם אתה ער — דקה ל-${'{משימה}'} עוד עוזרת. ואם לא, ניפגש מחר בבוקר 💛"

🔹 יום 3 בסטריק (consecutive_missed_days=2, רק בוקר):
• morning — אכפתי, שואל מה קורה, בלי שיפוט.
  רוח: "${'{שם}'} 😕 שלושה ימים בלי ${'{משימה}'} — מה קורה? יש משהו שאני יכול לעזור בו?"

🔹 DORMANT (consecutive_missed_days≥3, רק יום ראשון בבוקר):
• 3-6 ימים (worried): "וואי ${'{שם}'}, מתגעגע. ${'{משימה}'} מחכה כשתחזור, בקצב שלך 💛"
• 7+ ימים (check_in): "${'{שם}'}, מה קורה איתך? בלי לחץ עם ${'{משימה}'} — רק רוצה לדעת איך אתה."

🚨 חוקי מטריצה (חובה):
1. אם notifications_today_sent ≥ 1 — חובה לרמוז שניסית להגיע אליו היום ("לא שמעתי ממך היום" / "!!"). אסור לפתוח כאילו זו ההודעה הראשונה של היום.
2. אם notifications_today_sent === 2 (ערב) — טון רך, מצדיק שתיקה ("יום עמוס", "אם אתה ער", "ניפגש מחר"). לא לוחץ.
3. כל הניסוחים למעלה הם *רוח* — שנה מילים, אנרגיה, אימוג'י. אסור העתקה מילולית.

❗ חוקי פלט מחמירים (לכל המצבים):
- 1 עד 2 משפטים. עד 40 מילים סך הכל. עד 250 תווים.
- עברית טבעית, פנייה אישית לפי השם (user_first_name).
- בלי גרשיים מסביב להודעה.
- בלי הקדמות כמו "הנה ההודעה:" / "אני מציע:".
- אימוג'י אחד עד שניים בלבד, במקום שמרגיש טבעי.
- אסור להמציא פרטים שלא קיבלת (אל תזכיר משקל, ארוחות, שעות מדויקות, מספרים).
- שורה אחת או שתיים — אבל בלי שורה ריקה ביניהן.`;

/**
 * 🪶 Lean user message — לפי "הנחיה 2" של Claude לאופטימיזציית טוקנים.
 *
 * הרציונל: ה-system prompt *כבר* מכיל את כל החוקים והפרסונה. ה-user
 * message צריך להעביר רק את הפרמטרים הקונקרטיים של הקריאה הנוכחית.
 * החלפה של `JSON.stringify(..., null, 2)` הצפוף בשורות פייפ-מופרדות
 * חוסכת ~60% מטוקני ה-input בלי לפגוע באיכות (המדידות במסמך Claude #2).
 *
 * הכלל: שורה אחת לכל שדה, כל שדה אופציונלי שאינו קיים — לא נכנס בכלל.
 * מודולציית הטון (urgency_level) מקבלת hint קצר עם הסגנון הצפוי כדי
 * שה-LLM לא יצטרך "להחליט מחדש" איזה רגש לאמץ.
 */
/** בונה את ה-user message ל-LLM — מיוצא לבדיקות. */
export function buildUserMessage(ctx: AINotificationContext): string {
  const lines: string[] = [];

  // שורת פרמטרים קומפקטית, ללא JSON. כל ערך בנפרד ומסומן בעברית.
  lines.push(`שם: ${ctx.user_first_name}`);
  lines.push(`משימה: ${ctx.task_name}`);
  lines.push(`חלק יום: ${ctx.time_of_day}`);
  lines.push(`ימים רצוף ללא ביצוע: ${ctx.consecutive_missed_days}`);
  if (ctx.time_ago_text) {
    lines.push(`כמה זמן: ${ctx.time_ago_text}`);
  }
  if (
    typeof ctx.notifications_today_sent === 'number' &&
    ctx.notifications_today_sent > 0
  ) {
    lines.push(`התראות שכבר נשלחו היום: ${ctx.notifications_today_sent}`);
  }
  lines.push(`טון נדרש: ${ctx.urgency_level}`);
  if (URGENCY_STYLE_HINTS_HE[ctx.urgency_level]) {
    lines.push(`רמז סגנון: ${URGENCY_STYLE_HINTS_HE[ctx.urgency_level]}`);
  }
  if (typeof ctx.notification_count === 'number' && ctx.notification_count > 0) {
    lines.push(`מספר התראות שכבר נשלחו: ${ctx.notification_count}`);
  }
  if (typeof ctx.hours_since_last_response === 'number') {
    lines.push(`שעות מאז שהיה פעיל: ${ctx.hours_since_last_response}`);
  }

  // זיכרון ארוך-טווח — רק אם קיים בפועל (לא מציפים את ה-LLM ב-key ריק).
  const weekly = ctx.ai_memory?.latest_weekly_insight?.trim();
  const monthly = ctx.ai_memory?.latest_monthly_insight?.trim();
  if (weekly) lines.push(`רמז שבועי: ${weekly}`);
  if (monthly) lines.push(`רמז חודשי: ${monthly}`);

  lines.push('');
  lines.push('הפק הודעת push אחת בעברית — עד 40 מילים, עד 250 תווים, בלי גרשיים.');

  return lines.join('\n');
}

/** מנרמל את התשובה הגולמית של ה-LLM. מחזיר '' אם פסול / ריק. */
function postProcess(text: string): string {
  let cleaned = (text ?? '').trim();
  // הסרת גרשיים פותחים/סוגרים אם המודל הוסיף בכל זאת
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  if (!cleaned) return '';
  // עד 2 שורות, מאוחדות ברווח (לא שורה ריקה ביניהן)
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  cleaned = lines.slice(0, 2).join(' ');
  if (!cleaned) return '';
  if (cleaned.length > 250) cleaned = `${cleaned.slice(0, 247)}…`;
  return cleaned;
}

interface AttemptStep {
  /** מיתוג לקריאה ל-logs. */
  label: string;
  /** Lazy resolver של ה-client כדי לתפוס שינויי env בזמן אמת. */
  resolveClient: () => OpenAI;
  model: string;
  timeoutMs: number;
  /** מספר ניסיונות באותו צעד (retry על אותו model). */
  attempts: number;
}

interface ChainResult {
  body: string;
  model: string;
  attempts: number;
  usedFallback: boolean;
  errors: string[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function callOnce(
  client: OpenAI,
  model: string,
  ctx: AINotificationContext,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.8,
        // 🪶 Token-budget tightening לפי "הנחיה 2" של Claude. היעד הוא ~40
        // מילים / ~250 תווים (≈ 60 טוקנים בעברית), עם buffer ל-emoji
        // ותווים מיוחדים. 140 חוסך ~36% מ-output budget מבלי לפגוע במגבלת
        // האורך המקסימלית של הודעת push.
        max_tokens: 140,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(ctx) },
        ],
      },
      { signal: controller.signal }
    );
    const raw = completion.choices?.[0]?.message?.content ?? '';
    const cleaned = postProcess(raw);
    if (!cleaned) throw new Error('empty_or_invalid_response');
    return cleaned;
  } finally {
    clearTimeout(timer);
  }
}

function buildChain(modelOverride?: string): AttemptStep[] {
  const primary = modelOverride ?? NOTIFICATION_ENGINE_MODEL;
  const steps: AttemptStep[] = [
    {
      label: 'openrouter-primary',
      resolveClient: getNotificationLLM,
      model: primary,
      timeoutMs: 15_000,
      attempts: 2,
    },
  ];

  // משני: רק אם המודל שונה מהראשי (אחרת זה כפילות).
  if (NOTIFICATION_ENGINE_MODEL_SECONDARY !== primary) {
    steps.push({
      label: 'openrouter-secondary',
      resolveClient: getNotificationLLM,
      model: NOTIFICATION_ENGINE_MODEL_SECONDARY,
      timeoutMs: 15_000,
      attempts: 1,
    });
  }

  // שלישוני: Groq — ספק שונה לחלוטין (cross-provider failover).
  steps.push({
    label: 'groq-tertiary',
    resolveClient: getNotificationBackgroundLLM,
    model: NOTIFICATION_BACKGROUND_MODEL,
    timeoutMs: 10_000,
    attempts: 1,
  });

  return steps;
}

export interface GenerateNotificationOptions {
  /** Override של המודל הראשי בלבד. ה-failover chain נשאר כפי שהוא. */
  model?: string;
  /**
   * 🛑 *Deprecated* — נשאר בחתימה לתאימות אחורה, אך לא נעשה בו שימוש.
   * אין יותר template סטטי; אם כל ה-LLM chain נכשל, הפונקציה זורקת.
   * צרכן צריך לתפוס את ה-throw ולא להכניס notification ל-DB.
   */
  fallbackState?: NotificationState;
}

export async function generateNotificationText(
  ctx: AINotificationContext,
  options: GenerateNotificationOptions = {}
): Promise<ChainResult> {
  // 🚨 חוק קריטי: אם המשתמש כבר השלים — לא קוראים ל-LLM בכלל.
  if (ctx.has_completed_today) {
    throw new Error(
      'generateNotificationText: has_completed_today=true → must not call LLM'
    );
  }

  const chain = buildChain(options.model);
  const errors: string[] = [];
  let attemptCount = 0;

  for (const step of chain) {
    for (let i = 1; i <= step.attempts; i += 1) {
      attemptCount += 1;
      try {
        const client = step.resolveClient();
        const body = await callOnce(client, step.model, ctx, step.timeoutMs);
        return {
          body,
          model: step.model,
          attempts: attemptCount,
          usedFallback: false,
          errors,
        };
      } catch (err) {
        const msg =
          err instanceof Error ? `${step.label}#${i}: ${err.message}` : `${step.label}#${i}`;
        errors.push(msg);
        // eslint-disable-next-line no-console
        console.warn('[notification-engine] LLM attempt failed:', msg);
        // exp backoff קצר בין ניסיונות באותו צעד
        if (i < step.attempts) {
          await sleep(300 * i);
        }
      }
    }
  }

  // 🛑 כל ה-LLM chain נכשל. אין יותר template סטטי — זורקים שגיאה.
  // הצרכן (Upstash Workflow) צריך לתפוס, ללא להכניס notification ל-DB.
  // עדיף שקט מהודעה רובוטית גנרית.
  // eslint-disable-next-line no-console
  console.error(
    '[notification-engine] All LLM providers failed, throwing (no static fallback):',
    errors
  );
  throw new Error(
    `[notification-engine] all LLM providers failed after ${attemptCount} attempts: ${errors.join(' | ')}`
  );
}
