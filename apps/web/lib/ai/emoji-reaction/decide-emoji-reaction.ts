/**
 * החלטת תגובת אימוג'י חכמה של המנטור על הודעת המשתמש.
 * רץ ברקע במקביל לכותב — לא חוסם את התשובה הרגילה.
 *
 * עדיפות: LLM רגיש → נפילה דטרמיניסטית למסרים רגשיים ברורים.
 */

import 'server-only';

import { z } from 'zod';

import { getClientForModel, AI_MODELS } from '../client';
import { heuristicEmojiReaction } from './heuristic';
import { parseMentorEmojiReaction } from './marker';
import type { MentorEmojiReaction } from './types';

export type { MentorEmojiReaction };

const DECISION_TIMEOUT_MS = 3200;
const MAX_TOKENS = 120;

const decisionSchema = z.object({
  react: z.boolean(),
  emoji: z.string().max(16).optional().nullable(),
  verb: z.string().max(24).optional().nullable(),
  intent: z
    .enum(['support', 'celebrate', 'thanks', 'encourage', 'empathy', 'joy', 'none'])
    .optional()
    .nullable(),
});

const SYSTEM = `אתה מחליט אם המנטור "אלמוג" יגיב באימוג'י להודעת המשתמש — כמו תגובה בוואטסאפ, *בנוסף* לתשובה המילולית.

המטרה: האימוג'י מעביר *מסר רגשי קצר* (תמיכה / עידוד / שמחה משותפת) — לא קישוט.

מתי חובה react=true (אל תחסוך):
- המשתמש צריך תמיכה / עצוב / קשה לו / מפחד / מיואש → 💙 או 🤍 או 🤗 או 🫂 + verb כמו "תומך"/"מחבק"/"הזדהה"
- הצלחה / גאווה / סיים משימות → 💪 או ✨ או 👏 או 🙌 + "חיזק"/"מחא כפיים"
- תודה / חיבה → ❤️ או 🙏 + "אהב"
- התרגשות חיובית → ✨ או 😊 + "שמח איתך"

מתי בדרך כלל react=false:
- שאלה טכנית/יבשה, אישור קצר ("אוקיי"), פטפוט בלי מטען רגשי.
- משבר אקוטי חריף מאוד — עדיף לפעמים בלי אימוג'י (התשובה המילולית מובילה), חוץ מאמפתיה עדינה (💙/🫂) אם זה מרגיש נכון.

חוקי טון (קריטי):
- לעולם לא 😂 🤣 💀 על כאב/כישלון/עצבות.
- לא ספאם ולא שטותי. אימוג'י אחד (או רצף קצר כמו ❤️‍🩹).
- יש לך גישה לכל אימוג'י בעולם (Unicode) — בחר את המדויק ביותר למסר.
- verb = פועל/ביטוי עברי קצר לטולטיפ (בלי שם המנטור): תומך / מחבק / אהב / חיזק / עודד / הזדהה / מחא כפיים / שמח איתך.

החזר JSON בלבד:
{"react":true,"emoji":"💙","verb":"תומך","intent":"support"}
או {"react":false,"emoji":null,"verb":null,"intent":"none"}`;

function looksTrivialAck(text: string): boolean {
  const t = text.trim();
  if (t.length <= 2) return true;
  return /^(אוקיי|אוקי|בסדר|סבבה|יאללה|👍|ok|okay|ty)[.!]*$/i.test(t);
}

export type DecideEmojiReactionParams = {
  userMessage: string;
  priorUserSnippet?: string | null;
};

async function decideWithLlm(
  userMessage: string,
  prior: string | null | undefined
): Promise<MentorEmojiReaction | null> {
  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if (!hasGroq && !hasOpenRouter) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);

  const userContent = [
    prior?.trim() ? `הודעה קודמת של המשתמש (הקשר):\n${prior.trim().slice(0, 280)}` : null,
    `הודעת המשתמש לתגובה:\n${userMessage.slice(0, 900)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = hasGroq ? getClientForModel('background_groq') : getClientForModel('empathy');
    const model = hasGroq ? AI_MODELS.background_groq : AI_MODELS.empathy;

    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.25,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent },
        ],
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = decisionSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success || !parsed.data.react) return null;

    return parseMentorEmojiReaction({
      emoji: parsed.data.emoji,
      verb: parsed.data.verb,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * מחזיר תגובה או null (אין תגובה).
 */
export async function decideEmojiReaction(
  params: DecideEmojiReactionParams
): Promise<MentorEmojiReaction | null> {
  const userMessage = params.userMessage.trim();
  if (!userMessage || userMessage.length < 2) return null;

  const heuristic = heuristicEmojiReaction(userMessage);

  if (looksTrivialAck(userMessage) && !heuristic) return null;

  const fromLlm = await decideWithLlm(userMessage, params.priorUserSnippet);

  /** חוסם אימוג'י לא-מתאים (צחוק על כאב) גם אם המודל טעה. */
  if (fromLlm && heuristic?.emoji === '💙' && /[😂🤣💀]/u.test(fromLlm.emoji)) {
    return heuristic;
  }

  /** LLM ניצח כשיש תוצאה; אחרת — מסר רגשי ברור מההיוריסטיקה. */
  if (fromLlm) return fromLlm;
  if (heuristic) return heuristic;

  return null;
}
