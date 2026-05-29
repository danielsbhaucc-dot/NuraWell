/**
 * `generateNotificationText` — מייצר טקסט push אישי וקצר (max 15 מילים)
 * דרך **OpenRouter** (`openai/gpt-5-mini`), על בסיס הקשר דו-ממדי
 * (time_of_day × consecutive_missed_days).
 *
 * עיצוב הפרומפט:
 *   • System  : אישיות "אלמוג" (חם, חברי, הומור עדין, אימוג'ים מדודים)
 *               + מטריצת התנהגות 2D מפורשת שמקשרת בין שני הצירים.
 *   • User    : JSON של ה-Context לפי המפרט (snake_case) + הוראות פלט.
 *
 * Defensive: אם `has_completed_today === true` מגיע איכשהו לפונקציה —
 * מבטלים מיידית בלי לקרוא ל-LLM (חוק קריטי במפרט).
 *
 * Fallback: אם ה-LLM נכשל / טיים-אאוט / החזיר ריק → טמפלייט סטטי
 * נבחר לפי ה-NotificationState הפנימי (אופציונלי) כדי לא להשאיר
 * את המשתמש בלי התראה.
 */

import type {
  AINotificationContext,
  NotificationState,
} from '../../types/notification-state';
import {
  getNotificationLLM,
  NOTIFICATION_ENGINE_MODEL,
} from './llm-clients';

const SYSTEM_PROMPT = `אתה "אלמוג" — מאמן בריאות אישי של אפליקציית NuraWell. אתה מדבר עברית, חם, חברי, אופטימי, עם קורט הומור עדין ושימוש מדוד באימוג'ים (1–2 לכל היותר).

תפקידך עכשיו: לכתוב הודעת push *אחת* קצרצרה למשתמש שאמור להזכיר לו את משימת היום שלו.

אתה מקבל הקשר דו-ממדי (2D context matrix):
• time_of_day — איפה המשתמש בתוך היום: morning / noon / evening.
• consecutive_missed_days — כמה ימים *רצופים לפני היום* הוא החמיץ:
    0 = רק היום הוא עוד לא סימן (אתמול היה תקין / זה יום ראשון בסטריק).
    1 = אתמול לא סימן, וגם היום עדיין לא.
    2+ = שני ימים רצופים ויותר בלי ביצוע — הוא בדרך לנשירה אמיתית.
• has_completed_today — תמיד יגיע אליך כ-false. אם תקבל true — אל תכתוב שום הודעה (אבל זה לא יקרה כי המערכת כבר מסננת לפני שאתה נקרא).

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

❗ חוקי פלט מחמירים (לכל המצבים):
- שורה אחת בלבד.
- מקסימום 15 מילים.
- עברית טבעית, פנייה אישית לפי השם (user_first_name).
- בלי גרשיים מסביב להודעה.
- בלי הקדמות כמו "הנה ההודעה:" / "אני מציע:".
- אימוג'י אחד עד שניים בלבד, במקום שמרגיש טבעי.
- אסור להמציא פרטים שלא קיבלת (אל תזכיר משקל, ארוחות, שעות מדויקות, מספרים).`;

function buildUserMessage(ctx: AINotificationContext): string {
  return [
    'הפק עכשיו הודעת push אחת בלבד, על בסיס הקשר 2D הבא.',
    'חצה את שני הצירים (time_of_day × consecutive_missed_days) בקפדנות לפי החוקים שב-system.',
    '',
    JSON.stringify(ctx, null, 2),
    '',
    'החזר רק את ההודעה עצמה — שורה אחת, ≤15 מילים, עברית.',
  ].join('\n');
}

/** טמפלייטים גיבוי לכשל ב-LLM (אסור להשאיר משתמש בלי התראה). */
const FALLBACK_TEMPLATES: Record<NotificationState, (name: string, task: string) => string> = {
  MORNING_KICKOFF: (n, t) => `בוקר טוב ${n}! יום חדש, התחל ב"${t}" — אתה זה 💪`,
  NOON_CHECK: (n, t) => `היי ${n}, צ'ק-אין קצר: עוד לא סימנת "${t}" — אפשר עכשיו? 😊`,
  EVENING_CHECK: (n, t) => `${n}, היום כמעט נגמר — דקה אחת ל"${t}" וסגרנו יום 🌙`,
  DAY_2_MISSED: (n, t) => `${n}, שמתי לב ש"${t}" נדחה — הכל בסדר? אני כאן 💛`,
  DAY_3_MISSED: (n, t) => `${n}, כבר כמה ימים בלי "${t}". מה קורה? בוא נדבר 🤝`,
  DORMANT: (n, t) => `${n}, מתגעגע! "${t}" מחכה לך כשתחזור. בלי לחץ 🌿`,
};

function postProcess(text: string, fallback: string): string {
  let cleaned = (text ?? '').trim();
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  cleaned = cleaned.split(/\r?\n/)[0]?.trim() ?? '';
  if (!cleaned) return fallback;
  if (cleaned.length > 160) cleaned = `${cleaned.slice(0, 157)}…`;
  return cleaned;
}

export interface GenerateNotificationOptions {
  /** Override של ה-model (default: ENV / `openai/gpt-5-mini`). */
  model?: string;
  /** טיים-אאוט קליינט-side במילישניות (default 12s). */
  timeoutMs?: number;
  /**
   * NotificationState פנימי (לבחירת fallback אם ה-LLM נכשל). לא נשלח ל-LLM.
   * אם לא יסופק → ייגזר אוטומטית מהקונטקסט הדו-ממדי לבחירת fallback בלבד.
   */
  fallbackState?: NotificationState;
}

/** גזירת state מינימלית רק בשביל בחירת טמפלייט fallback. */
function pickFallbackState(ctx: AINotificationContext): NotificationState {
  if (ctx.consecutive_missed_days >= 3) return 'DORMANT';
  if (ctx.consecutive_missed_days === 2) return 'DAY_3_MISSED';
  if (ctx.consecutive_missed_days === 1) return 'DAY_2_MISSED';
  if (ctx.time_of_day === 'morning') return 'MORNING_KICKOFF';
  if (ctx.time_of_day === 'noon') return 'NOON_CHECK';
  return 'EVENING_CHECK';
}

export async function generateNotificationText(
  ctx: AINotificationContext,
  options: GenerateNotificationOptions = {}
): Promise<{ body: string; usedFallback: boolean; model: string }> {
  // 🚨 חוק קריטי: אם המשתמש כבר השלים — לא קוראים ל-LLM בכלל.
  if (ctx.has_completed_today) {
    throw new Error(
      'generateNotificationText: has_completed_today=true → must not call LLM'
    );
  }

  const fallbackState = options.fallbackState ?? pickFallbackState(ctx);
  const fallback = FALLBACK_TEMPLATES[fallbackState](
    ctx.user_first_name,
    ctx.task_name
  );
  const model = options.model ?? NOTIFICATION_ENGINE_MODEL;
  const timeoutMs = options.timeoutMs ?? 12_000;

  let body = '';
  let usedFallback = false;
  try {
    const client = getNotificationLLM();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: 0.8,
          max_tokens: 80,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(ctx) },
          ],
        },
        { signal: controller.signal }
      );
      const raw = completion.choices?.[0]?.message?.content ?? '';
      body = postProcess(raw, fallback);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[generate-notification-text] LLM failed, using fallback:', err);
    body = fallback;
    usedFallback = true;
  }

  if (!body) {
    body = fallback;
    usedFallback = true;
  }
  return { body, usedFallback, model };
}
