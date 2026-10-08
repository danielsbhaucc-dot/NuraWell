/**
 * החלטת תגובת אימוג'י חכמה של המנטור על הודעת המשתמש.
 *
 * LLM בוחר חופשי מכל Unicode לפי המסר הרגשי.
 * היוריסטיקה רק: רמז כוונה + נפילה ממגוון מאגרים (לא 3 אימוג'ים קבועים).
 */

import 'server-only';

import { z } from 'zod';

import { getClientForModel, AI_MODELS } from '../client';
import {
  detectReactionSignal,
  isInappropriateLaughEmoji,
  isVulnerableIntent,
  pickFallbackReaction,
} from './heuristic';
import { parseMentorEmojiReaction } from './marker';
import type { MentorEmojiReaction, ReactionIntent } from './types';

export type { MentorEmojiReaction };

const DECISION_TIMEOUT_MS = 3400;
const MAX_TOKENS = 140;

const INTENT_VALUES = [
  'crisis_care',
  'support',
  'empathy',
  'celebrate',
  'micro_win',
  'thanks',
  'joy',
  'encourage',
  'warmth',
  'relief',
  'focus',
  'gentle_humor',
  'none',
] as const;

const decisionSchema = z.object({
  react: z.boolean(),
  emoji: z.string().max(16).optional().nullable(),
  verb: z.string().max(24).optional().nullable(),
  intent: z.enum(INTENT_VALUES).optional().nullable(),
});

const SYSTEM = [
  'אתה בוחר תגובת אימוג\'י עבור המנטור "אלמוג" — כמו react בוואטסאפ, *בנוסף* לתשובה המילולית.',
  '',
  'תפקיד האימוג\'י: להעביר *מסר רגשי מדויק* בסימן אחד. לא קישוט, לא ספאם, לא קלישאה חוזרת.',
  '',
  'יש לך גישה לכל אימוג\'י בעולם (Unicode מלא). אל תצטמצם ללב/שריר/תודה.',
  'בחר את הסימן הכי מדויק לסיטואציה — כולל ניואנסים:',
  '- פחד/חרדה → 🤍 🤗 🫧 🕊️ (לא בהכרח 💙)',
  '- עייפות/שחיקה → 😮‍💨 🌑 🛏️ ❤️‍🩹',
  '- געגוע לתמיכה → 🫂 🤲 🫶',
  '- גאווה גדולה → 🏆 🌟 🚀 🔥 🎉 (לא רק 💪)',
  '- ניצחון קטן (מים/הליכה/שינה) → אימוג\'י ספציפי לנושא (💧 🚶 😴 🥗 🧘) או 👏 ✅ 🌱',
  '- תודה חמה → ❤️ 💕 🌹 🙏 🫶',
  '- הקלה → 😮‍💨 🌿 ☀️ 😌',
  '- הומור עדין מהמשתמש → 🙂 😊 😉 (לעולם לא הגזמה)',
  '- מיקוד/התחייבות → 🎯 ⚡ 📌',
  '',
  'מתי react=true (אל תהיה שמרן):',
  '- יש מטען רגשי, תמיכה נדרשת, הצלחה, תודה, הקלה, ניצחון קטן, עידוד.',
  'מתי react=false:',
  '- שאלה יבשה/טכנית, "אוקיי", פטפוט בלי רגש.',
  '',
  'חוקי ברזל:',
  '- לעולם לא 😂 🤣 💀 על כאב/כישלון/עצבות/משבר.',
  '- אימוג\'י אחד או רצף קצר (❤️‍🩹). לא שרשרת.',
  '- verb קצר בעברית לטולטיפ (בלי שם המנטור): תומך / מחבק / אהב / חיזק / עודד / הזדהה / מחא כפיים / שמח איתך / מרגיע / חוגג / ציין / איתך / מעריך',
  '- גוון: אל תחזור תמיד על אותו אימוג\'י לאותה קטגוריה — התאם למילים של ההודעה הזו.',
  '',
  'החזר JSON בלבד:',
  '{"react":true,"emoji":"🕊️","verb":"מרגיע","intent":"support"}',
  'או {"react":false,"emoji":null,"verb":null,"intent":"none"}',
].join('\n');

function looksTrivialAck(text: string): boolean {
  const t = text.trim();
  if (t.length <= 2) return true;
  return /^(אוקיי|אוקי|בסדר|סבבה|יאללה|👍|ok|okay|ty)[.!]*$/i.test(t);
}

export type DecideEmojiReactionParams = {
  userMessage: string;
  priorUserSnippet?: string | null;
};

async function decideWithLlm(params: {
  userMessage: string;
  prior?: string | null;
  intentHint?: ReactionIntent | null;
  hints?: string[];
}): Promise<(MentorEmojiReaction & { intent?: string | null }) | null> {
  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if (!hasGroq && !hasOpenRouter) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);

  const userContent = [
    params.prior?.trim()
      ? `הודעה קודמת של המשתמש (הקשר):\n${params.prior.trim().slice(0, 280)}`
      : null,
    params.intentHint
      ? `רמז כוונה מהמערכת (לא חובה להיצמד לאימוג'י ספציפי — בחר חופשי ומדויק): ${params.intentHint}${
          params.hints?.length ? ` · ${params.hints.join(', ')}` : ''
        }`
      : null,
    `הודעת המשתמש לתגובה:\n${params.userMessage.slice(0, 900)}`,
    "בחר אימוג'י *מדויק להודעה הזו* מכל Unicode. אל תתקבע על 💙/💪/❤️ אלא אם הם באמת הכי מדויקים.",
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = hasGroq ? getClientForModel('background_groq') : getClientForModel('empathy');
    const model = hasGroq ? AI_MODELS.background_groq : AI_MODELS.empathy;

    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.55,
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

    const reaction = parseMentorEmojiReaction({
      emoji: parsed.data.emoji,
      verb: parsed.data.verb,
    });
    if (!reaction) return null;
    return { ...reaction, intent: parsed.data.intent ?? null };
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

  const signal = detectReactionSignal(userMessage);

  if (looksTrivialAck(userMessage) && !signal?.mustReact) return null;

  const fromLlm = await decideWithLlm({
    userMessage,
    prior: params.priorUserSnippet,
    intentHint: signal?.intent ?? null,
    hints: signal?.hints,
  });

  if (fromLlm) {
    if (isVulnerableIntent(signal?.intent) && isInappropriateLaughEmoji(fromLlm.emoji)) {
      return pickFallbackReaction(signal!.intent, userMessage);
    }
    return { emoji: fromLlm.emoji, verb: fromLlm.verb };
  }

  /** נפילה: רק כשיש אות רגשי ברור — ממגוון מאגרים לפי כוונה+תוכן. */
  if (signal?.mustReact) {
    return pickFallbackReaction(signal.intent, userMessage);
  }

  return null;
}
