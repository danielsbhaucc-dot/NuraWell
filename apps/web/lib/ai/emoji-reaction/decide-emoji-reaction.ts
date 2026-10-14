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
import { isGroqLaneAvailable } from '../groq-compat';

export type { MentorEmojiReaction };

const DECISION_TIMEOUT_MS = 3400;
/** gpt-5-mini reasons by default; 140 tokens were eaten by reasoning → empty JSON → heuristic fallback fired instead. */
const MAX_TOKENS = 400;

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
  /** Model often invents intent labels ("humor", "hard_day"); a strict enum silently dropped good reactions. */
  intent: z.string().max(32).optional().nullable(),
});

const SYSTEM = [
  'אתה מחליט אם אלמוג שם react (אימוג\'י אחד) על הודעת המשתמש, כמו בוואטסאפ. התשובה המילולית נשלחת בכל מקרה.',
  '',
  'ברירת המחדל: לא שמים. רוב ההודעות (בערך 2 מתוך 3) לא מקבלות אימוג\'י.',
  'שמים רק כשיש בהודעה רגע רגשי ברור, שחבר באמת היה מגיב עליו:',
  '- הצלחה שהוא מספר עליה → אימוג\'י של הנושא כשיש: הליכה 🚶, מים 💧, שינה 😴, עמד בפיתוי 💪, הישג גדול 🔥 🎉. אחרת 👏.',
  '- משהו מצחיק שהוא כתב (חחח, בדיחה על עצמו) → 😄 😂 😅. למשל "אכלתי את השוקולד של הילדים והאשמתי את הכלב" → 😂.',
  '- רגע קשה רגיל (יום קשה בעבודה, עייפות, בדידות, עצב) → 🫂 🤍. למשל "היה לי יום ממש קשה" → 🫂.',
  '- תודה חמה ואישית ("באמת עזרת לי") → ❤️ 🙏. "תודה" קצר — לא.',
  '',
  'לא שמים (react=false):',
  '- שאלה, בקשה, עדכון יבש, פטפוט, "היי", "אוקיי", "תודה" קצר, דיון על התוכנית.',
  '- ויכוח, האשמה, עצבים על אלמוג, תירוצים.',
  '- כשלא בטוח.',
  '- אף פעם בנושאים רגישים: משבר, פגיעה עצמית, מחשבות אובדניות, הפרעות אכילה (הקאות, צום, בולמוס, משלשלים), אלימות, התעללות, אבל/מוות, מצב רפואי, תרופות, הריון, משקל ומראה הגוף.',
  '',
  'חוקים: אימוג\'י אחד בלבד. אף פעם לא צחוק על כאב או כישלון. האימוג\'י צריך להתאים לתוכן הספציפי.',
  'verb קצר בעברית לטולטיפ: שמח איתך / מחא כפיים / צחק / איתך / מחבק / אהב.',
  '',
  'החזר JSON בלבד:',
  '{"react":true,"emoji":"👏","verb":"מחא כפיים","intent":"micro_win"}',
  'או {"react":false,"emoji":null,"verb":null,"intent":"none"}',
].join('\n');

/** נושאים רגישים — אף פעם לא react. */
const SENSITIVE_RE =
  /(להתאבד|אובדנ|לא רוצה לחיות|שלא אהיה|שלא הייתי|להיעלם|לא אוכל כבר|למות|לפגוע בעצמ|חותכ|חתכתי|הקא|מקיא|להקיא|בולמוס|צום|לא אכלתי .*ימים|משלשל|הפרעת אכילה|אנורקס|בולימ|מכה אותי|הרביץ|התעלל|אונס|הטריד|נפטר|לוויה|יושבים שבעה|(?:^|\s)מת(?:ה|ו)?(?:\s|$)|סרטן|אבחנ|אבחון|תרופ|כדורים|בהריון|הפלה|שוקל|קילו|שמנ|מכוער|הגוף שלי)/;

export function isSensitiveForReaction(text: string): boolean {
  return SENSITIVE_RE.test(text);
}

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
  const hasGroq = isGroqLaneAvailable();
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if (!hasGroq && !hasOpenRouter) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);

  const userContent = [
    params.prior?.trim()
      ? `הודעה קודמת של המשתמש (הקשר):\n${params.prior.trim().slice(0, 280)}`
      : null,
    params.intentHint
      ? `רמז (לא מחייב, מותר גם לא להגיב): ${params.intentHint}${
          params.hints?.length ? ` · ${params.hints.join(', ')}` : ''
        }`
      : null,
    `הודעת המשתמש לתגובה:\n${params.userMessage.slice(0, 900)}`,
    "יש פה רגע רגשי ברור (הצלחה / מצחיק / רגע קשה לא רגיש)? אם לא — react=false.",
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = hasGroq ? getClientForModel('background_groq') : getClientForModel('empathy');
    const model = hasGroq ? AI_MODELS.background_groq : AI_MODELS.empathy;

    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        ...(hasGroq ? {} : ({ reasoning: { effort: 'minimal' } } as Record<string, unknown>)),
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

  if (isSensitiveForReaction(userMessage)) return null;

  const signal = detectReactionSignal(userMessage);
  if (signal?.intent === 'crisis_care') return null;

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
