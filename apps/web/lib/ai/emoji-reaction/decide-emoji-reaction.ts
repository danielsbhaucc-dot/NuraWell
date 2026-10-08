/**
 * החלטת תגובת אימוג'י חכמה של המנטור על הודעת המשתמש.
 * רץ ברקע במקביל לכותב — לא חוסם את התשובה הרגילה.
 */

import 'server-only';

import { z } from 'zod';

import { getClientForModel, AI_MODELS } from '../client';
import { parseMentorEmojiReaction } from './marker';
import type { MentorEmojiReaction } from './types';

export type { MentorEmojiReaction };

const DECISION_TIMEOUT_MS = 2800;
const MAX_TOKENS = 100;

const decisionSchema = z.object({
  react: z.boolean(),
  emoji: z.string().max(16).optional().nullable(),
  verb: z.string().max(24).optional().nullable(),
});

const SYSTEM = `אתה מחליט אם המנטור "אלמוג" יגיב באימוג'י להודעת המשתמש — כמו תגובה בוואטסאפ (לייק/לב/חיזוק), בנוסף לתשובה הרגילה (שלא באחריותך).

עקרונות:
1. לא בכל הודעה. במציאות מגיבים לפעמים. כוון לכ־25%–40% מההודעות. אם ההודעה שגרתית/טכנית/שאלה יבשה — בדרך כלל react=false.
2. חכם ומבוקר — לא שטותי, לא ספאם, לא אירוני על כאב.
3. התאמת טון קריטית:
   - עצוב / אובדן / בושה / כישלון כואב → אמפתיה עדינה (💙 🤍 🤗 🫂) — לעולם לא 😂 🤣 💀 או לייק קליל.
   - הצלחה / גאווה / בשורה טובה → חיזוק חם (💪 ✨ 🙌 👏 🔥) לפי העוצמה.
   - תודה / חיבה → ❤️ 🙏 לפי העוצמה.
   - הומור קליל מהמשתמש → אפשר חיוך עדין (😊 🙂) — לא הגזמה.
   - משבר / מצוקה רגשית חריפה → עדיף react=false (התשובה המילולית חשובה יותר).
4. יש לך גישה לכל אימוג'י בעולם (Unicode). בחר אימוג'י *אחד* (או רצף קצר כמו ❤️‍🩹) שמרגיש אנושי ומדויק — לא חובה מהרשימה למעלה.
5. verb = פועל עברי קצר לטולטיפ (בלי שם המנטור): אהב / חיזק / הזדהה / עודד / מחא כפיים / חייך / חיבק / ציין. לא משפט.

החזר JSON בלבד:
{"react":true|false,"emoji":"❤️"|null,"verb":"אהב"|null}`;

function looksTrivialAck(text: string): boolean {
  const t = text.trim();
  if (t.length <= 2) return true;
  return /^(תודה|תודה רבה|אוקיי|אוקי|בסדר|סבבה|יאללה|👍|❤️|💕|ok|okay|thanks|ty)[.!]*$/i.test(
    t
  );
}

export type DecideEmojiReactionParams = {
  userMessage: string;
  /** הקשר קצר אופציונלי (תור קודם) */
  priorUserSnippet?: string | null;
};

/**
 * מחזיר תגובה או null (אין תגובה / כשל שקט).
 */
export async function decideEmojiReaction(
  params: DecideEmojiReactionParams
): Promise<MentorEmojiReaction | null> {
  const userMessage = params.userMessage.trim();
  if (!userMessage || userMessage.length < 2) return null;

  /** אישור קצר מאוד — בדרך כלל בלי תגובה (אלא אם חם במיוחד, המודל יחליט). */
  if (looksTrivialAck(userMessage) && userMessage.length < 12 && !/[!?❤️💪🙏]/.test(userMessage)) {
    return null;
  }

  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if (!hasGroq && !hasOpenRouter) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);

  const prior = params.priorUserSnippet?.trim().slice(0, 280);
  const userContent = [
    prior ? `הודעה קודמת של המשתמש (הקשר):\n${prior}` : null,
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
        temperature: 0.35,
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
