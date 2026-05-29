/**
 * `generateNotificationText` — מייצר טקסט push אישי וקצר (max 15 מילים)
 * דרך OpenAI gpt-4o-mini, על בסיס ה-NotificationState וה-Payload המובנה.
 *
 * עיצוב הפרומפט:
 *   • System  : מגדיר את האישיות (Health coach חם, חברי, קצת הומור, אימוג'ים).
 *   • User    : JSON של ה-Payload + הוראות פלט מחמירות (≤15 מילים, שורה אחת,
 *                בלי quotation marks סביב, בעברית, בלי "הנה ההצעה:" וכו').
 *
 * fallback: אם API נכשל / החזיר טקסט ריק → מחזיר טמפלייט סטטי לפי ה-state,
 *           כדי שהמשתמש לא יישאר בלי התראה והיום לא ייעצר.
 */

import type {
  AINotificationPayload,
  NotificationState,
} from '../../types/notification-state';
import {
  getNotificationEngineOpenAI,
  NOTIFICATION_ENGINE_MODEL,
} from './openai-client';

const SYSTEM_PROMPT = `אתה "אלמוג" — מאמן בריאות אישי של אפליקציית NuraWell. אתה מדבר עברית, חם, חברי, אופטימי, עם קורט הומור עדין ושימוש מדוד באימוג'ים (1–2 לכל היותר).

תפקידך עכשיו: לכתוב הודעת push *אחת* קצרצרה למשתמש שאמור להזכיר לו את משימת היום שלו.

חוקי פלט מחמירים:
- שורה אחת בלבד.
- מקסימום 15 מילים.
- בעברית טבעית, פנייה אישית לפי השם.
- בלי גרשיים פותחים/סוגרים מסביב להודעה.
- בלי הקדמות כמו "הנה ההודעה:" / "אני מציע:".
- אימוג'י אחד עד שניים בלבד, במקום שמרגיש טבעי.
- אסור להמציא פרטים שלא קיבלת (אל תזכיר משקל, ארוחות, שעות וכו').

ההתאמה לפי notificationState:
- MORNING_KICKOFF: בוקר חיובי, מזמין להתחיל את היום עם המשימה.
- NOON_CHECK: צ'ק-אין קליל ליום, בלי לחץ.
- EVENING_CHECK: דחיפה עדינה — עוד אפשר לסיים היום.
- DAY_2_MISSED: דואג ואמפתי ("הכל בסדר? איך אפשר לעזור?") בלי לשפוט.
- DAY_3_MISSED: רציני, מודאג, פתוח לדיאלוג. רומז שמשהו השתבש, ואני כאן.
- DORMANT: פנייה חמה אחרי היעדרות; מזכיר שהדלת פתוחה. עדיין קצר וחיובי.`;

function buildUserMessage(payload: AINotificationPayload): string {
  return [
    'הפק עכשיו הודעת push לפי הנתונים הבאים. עקוב בקפדנות אחר חוקי הפלט שב-system.',
    '',
    'נתוני המשתמש:',
    JSON.stringify(payload, null, 2),
    '',
    'החזר רק את ההודעה עצמה — שורה אחת, ≤15 מילים, בעברית.',
  ].join('\n');
}

/** טמפלייטים גיבוי לכשל ב-LLM (אסור להשאיר משתמש בלי התראה). */
const FALLBACK_TEMPLATES: Record<NotificationState, (firstName: string, task: string) => string> = {
  MORNING_KICKOFF: (n, t) => `בוקר טוב ${n}! יום חדש, התחל ב"${t}" — אתה זה 💪`,
  NOON_CHECK: (n, t) => `היי ${n}, צ'ק-אין קצר: עוד לא סימנת "${t}" — אפשר עכשיו? 😊`,
  EVENING_CHECK: (n, t) => `${n}, נשאר זמן ליום — דקה אחת ל"${t}" וסיימנו 🌙`,
  DAY_2_MISSED: (n, t) => `${n}, שמתי לב ש"${t}" נדחה — הכל בסדר? אני כאן 💛`,
  DAY_3_MISSED: (n, t) => `${n}, כבר כמה ימים בלי "${t}". מה קורה? בוא נדבר 🤝`,
  DORMANT: (n, t) => `${n}, מתגעגע! "${t}" מחכה לך כשתחזור. בלי לחץ 🌿`,
};

/**
 * מנקה את התשובה של ה-LLM: מסיר ציטוטים, רווחים מיותרים, מגביל ל-160 תווים
 * (איזון בין "15 מילים" לבין הגנת DB), נופל ל-fallback אם ריק.
 */
function postProcess(text: string, fallback: string): string {
  let cleaned = (text ?? '').trim();
  // הסרת גרשיים פותחים/סוגרים אם המודל הוסיף בכל זאת
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  // שורה ראשונה בלבד
  cleaned = cleaned.split(/\r?\n/)[0]?.trim() ?? '';
  if (!cleaned) return fallback;
  if (cleaned.length > 160) cleaned = `${cleaned.slice(0, 157)}…`;
  return cleaned;
}

export interface GenerateNotificationOptions {
  /** Override של ה-model (default: ENV / gpt-4o-mini). */
  model?: string;
  /** טיים-אאוט קליינט-side במילישניות (default 12s). */
  timeoutMs?: number;
}

export async function generateNotificationText(
  payload: AINotificationPayload,
  options: GenerateNotificationOptions = {}
): Promise<{ body: string; usedFallback: boolean; model: string }> {
  const fallback = FALLBACK_TEMPLATES[payload.notificationState](
    payload.firstName,
    payload.taskName
  );
  const model = options.model ?? NOTIFICATION_ENGINE_MODEL;
  const timeoutMs = options.timeoutMs ?? 12_000;

  let body = '';
  let usedFallback = false;
  try {
    const client = getNotificationEngineOpenAI();
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
            { role: 'user', content: buildUserMessage(payload) },
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
