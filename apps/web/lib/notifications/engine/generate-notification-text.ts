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

❌ אסור לכתוב את הביטויים האלה (תרגום מכני מאנגלית או טון מערכת):
- "אני רואה ש..." / "שמתי לב ש..." (אלא אם זה ממש טבעי בסיפור)
- "אל תשכח" / "כדאי לזכור" / "חשוב להמשיך"
- "מצוין!" / "כל הכבוד" / "מדהים!" (קופאי גנרי — אין אצלך כאלה)
- "מה נעים לך לעשות?" / "איך אתה מרגיש?" כפתיחה
- "אני שמח לשמוע" / "אני מצטער לשמוע" (תרגום מאנגלית)
- "כבד לשמוע" / "ככה זה לפעמים"
- "מצב הבריאות שלך" / "המסע שלך" / "התקדמותך"
- "תזכורת:" / "התראה:" (אל תכתוב את המילה תזכורת)

✅ אתה כותב כך (אמיתי, חי, של חבר):
- "אהלן 👋" / "וואלה אחי" / "אוף 😕" / "יששש 🎯"
- "מה קורה אצלך?" / "איך הראש שלך?" / "מה תפס אותך היום?"
- "באמת קשה" / "אני כאן אם בא לך"
- שאלה אחת פתוחה בסוף (לא כן/לא, לא רשימה)
- שובר את הקצב באמצע משפט: "רגע — אז מה היה?"

📐 פורמט:
- 1–2 משפטים. 250 תווים מקסימום.
- אימוג'י אחד-שניים, רק אם נכון לרגש. לא תמיד.
- בלי גרשיים סביב ההודעה, בלי הקדמות, בלי כותרת.
- *לעולם* לא לכתוב "${'\u200F'}" (RTL marks), markdown, או bullets.

🎚️ אתה מקבל הקשר דו-ממדי (2D context matrix):
• time_of_day — איפה המשתמש בתוך היום: morning / noon / evening.
• consecutive_missed_days — כמה ימים *רצופים לפני היום* הוא החמיץ:
    0 = רק היום הוא עוד לא סימן (אתמול היה תקין / זה יום ראשון בסטריק).
    1 = אתמול לא סימן, וגם היום עדיין לא.
    2+ = שני ימים רצופים ויותר בלי ביצוע — הוא בדרך לנשירה אמיתית.
• has_completed_today — תמיד יגיע אליך כ-false. אם תקבל true — אל תכתוב שום הודעה.

🎚️ urgency_level — *מודולציית הטון* שאתה חייב לאמץ (מחושב מראש ב-rule-engine):
- gentle         → טון חם, מעודד, פתיחה חיובית. אימוג'י אחד טבעי.
- friendly_nudge → טון שובב ועדין, לא שיפוטי, עם קמצוץ הומור. דחיפה אחת.
- concerned      → טון אכפתי וקצת מודאג בלי דרמה. הראה שאתה זוכר.
- worried        → טון חם מאוד, קצת מתגעגע, מקבל לחלוטין. אל תלחיץ.
- check_in       → טון רגוע ונוכח כמו חבר ישן. שאל איך הוא — אל תזכיר משימה בכוח.

🧠 חוקי קישור צולב בין שני הצירים (קריטיים — חצה אותם תמיד):
1. consecutive_missed_days === 0:
   • morning → פתיחת יום חיובית וחמה. "בוקר חדש, בוא נתחיל".
   • noon    → צ'ק-אין קליל באמצע היום. בלי לחץ.
   • evening → ההתמקדות היא בעובדה ש*כל היום עבר* בלי עדכון. דחיפה עדינה לסגור את היום חזק — עוד יש זמן עכשיו.

2. consecutive_missed_days === 1:
   • morning → "אתמול דילגנו — בוא ניתן ליום הזה התחלה אחרת".
   • noon    → "אתמול לא סגרנו, היום עוד לא — איך אני יכול לעזור?".
   • evening → ההתמקדות היא בכך ש*אתמול הוחמץ והיום כמעט נגמר*. טון מעט יותר מודאג, אבל עדיין תומך. ולידציה רכה ושאלה אם הכל בסדר.

3. consecutive_missed_days >= 2:
   • הטון: דאגה כנה ואותנטית. המשתמש בסיכון אמיתי לנשירה. בלי שיפוט, בלי "אמרתי לך", בלי אשמה.
     שאל אם הכל בסדר. הזכר שאתה כאן בשבילו. הצע עזרה ספציפית רכה.

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

📚 דוגמאות (ככה, *לא* ככה):

— urgency=gentle, morning:
✓ "אהלן ${'{שם}'} 👋 בוקר חדש — בוא נתחיל עם ${'{משימה}'}. מה בא לך היום?"
✗ "בוקר טוב ${'{שם}'}! זוהי תזכורת לסמן את ${'{משימה}'}."

— urgency=friendly_nudge, evening:
✓ "אחי, היום כמעט נגמר. דקה ל-${'{משימה}'} ויוצאים מהיום נקי 🌙"
✗ "אני רואה שעדיין לא סימנת את ${'{משימה}'} היום."

— urgency=concerned, morning (יומיים-שלושה):
✓ "אוף ${'{שם}'} 😕 כבר כמה ימים בלי ${'{משימה}'}. מה תפס אותך?"
✗ "שמתי לב שיש לך 3 ימים רצופים ללא ביצוע. חשוב להמשיך."

— urgency=worried, after a week:
✓ "וואי ${'{שם}'}, מתגעגע. ${'{משימה}'} מחכה כשתחזור, בקצב שלך 💛"
✗ "אתה כבר שבוע לא פעיל. כדאי לחזור למסלול."

— urgency=check_in, dormant:
✓ "${'{שם}'}, איך הראש שלך עכשיו? בלי לחץ עם ${'{משימה}'} — רק רוצה לדעת מה איתך."
✗ "כל הכבוד על הניסיון. בוא נחזיר את הקצב."

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
function buildUserMessage(ctx: AINotificationContext): string {
  const lines: string[] = [];

  // שורת פרמטרים קומפקטית, ללא JSON. כל ערך בנפרד ומסומן בעברית.
  lines.push(`שם: ${ctx.user_first_name}`);
  lines.push(`משימה: ${ctx.task_name}`);
  lines.push(`חלק יום: ${ctx.time_of_day}`);
  lines.push(`ימים רצוף ללא ביצוע: ${ctx.consecutive_missed_days}`);
  if (ctx.time_ago_text) {
    lines.push(`כמה זמן: ${ctx.time_ago_text}`);
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

/** Template סטטי — נכנס *רק* כשכל 4 ניסיונות ה-LLM נכשלו. */
const ULTIMATE_FALLBACK: Record<NotificationState, (name: string, task: string) => string> = {
  MORNING_KICKOFF: (n, t) =>
    `בוקר טוב ${n}! יום חדש מחכה לך — בוא נפתח אותו עם "${t}". אתה זה 💪`,
  NOON_CHECK: (n, t) =>
    `היי ${n}, צ'ק-אין קצר באמצע היום: עוד לא סימנת "${t}" — אפשר עכשיו, גם דקה תספיק 😊`,
  EVENING_CHECK: (n, t) =>
    `${n}, היום כמעט נגמר ולא נסגר. דקה אחת ל"${t}" ויוצאים מהיום עם תחושת ניצחון 🌙`,
  DAY_2_MISSED: (n, t) =>
    `${n}, שמתי לב ש"${t}" נדחה כבר יום. הכל בסדר? אני כאן אם בא לך לדבר 💛`,
  DAY_3_MISSED: (n, t) =>
    `${n}, כבר כמה ימים רצוף בלי "${t}" — דואג לך באמת. מה מקשה? בוא ננסה ביחד 🤝`,
  DORMANT: (n, t) =>
    `${n}, מתגעגע אליך כאן! "${t}" מחכה לך כשתחזור. בלי לחץ, בקצב שלך 🌿`,
};

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

/** גזירת state מינימלית רק בשביל בחירת template-סוף-העולם. */
function pickFallbackState(ctx: AINotificationContext): NotificationState {
  if (ctx.consecutive_missed_days >= 3) return 'DORMANT';
  if (ctx.consecutive_missed_days === 2) return 'DAY_3_MISSED';
  if (ctx.consecutive_missed_days === 1) return 'DAY_2_MISSED';
  if (ctx.time_of_day === 'morning') return 'MORNING_KICKOFF';
  if (ctx.time_of_day === 'noon') return 'NOON_CHECK';
  return 'EVENING_CHECK';
}

export interface GenerateNotificationOptions {
  /** Override של המודל הראשי בלבד. ה-fallback chain נשאר כפי שהוא. */
  model?: string;
  /**
   * State פנימי לבחירת template-סוף-העולם, אם כל ה-chain נכשל.
   * אם לא יסופק → ייגזר אוטומטית מה-context.
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

  // הגענו לכאן? כל ה-chain נכשל — אירוע נדיר מאוד (שני ספקים down).
  const fallbackState = options.fallbackState ?? pickFallbackState(ctx);
  const body = ULTIMATE_FALLBACK[fallbackState](ctx.user_first_name, ctx.task_name);
  // eslint-disable-next-line no-console
  console.error(
    '[notification-engine] All LLM providers failed, using static template:',
    errors
  );
  return {
    body,
    model: 'static-template',
    attempts: attemptCount,
    usedFallback: true,
    errors,
  };
}
