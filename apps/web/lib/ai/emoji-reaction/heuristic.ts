/**
 * זיהוי כוונה רגשית + נפילה חכמה ממגוון אימוג'ים.
 * ה-LLM בוחר חופשי מכל Unicode; כאן רק רמז + fallback כשהמודל נכשל.
 */

import type { MentorEmojiReaction, ReactionIntent } from './types';

export type ReactionSignal = {
  intent: ReactionIntent;
  /** חובה להגיב גם אם ה-LLM שמרני */
  mustReact: boolean;
  /** רמזים קצרים לפרומפט (מילות מפתח מההודעה) */
  hints: string[];
};

type IntentRule = {
  intent: ReactionIntent;
  mustReact: boolean;
  pattern: RegExp;
  hint: string;
};

/** סדר = עדיפות. */
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'crisis_care',
    mustReact: true,
    hint: 'מצוקה חריפה',
    pattern:
      /(?:רוצה למות|לא רוצה לחיות|לפגוע בעצמ|להתאבד|suicidal|kill myself)/i,
  },
  {
    intent: 'support',
    mustReact: true,
    hint: 'צריך תמיכה',
    pattern:
      /(?:קשה לי|עצוב|עצובה|נשבר|נשברה|מיואש|מיואשת|לבד|בודד|בודדה|מפחד|מפחדת|חרד|חרדה|כואב לי|בוכה|דמעות|מדוכא|מדוכאת|אין לי כוח|לא מצליח|לא מצליחה|נכשלתי|מותש|מותשת|מרגיש רע|מרגישה רע|צריך תמיכה|צריכה תמיכה|תתמוך|תרגיע|מציף|מציפה)/i,
  },
  {
    intent: 'empathy',
    mustReact: true,
    hint: 'אמפתיה',
    pattern: /(?:מתבייש|מתביישת|אשם|אשמה|מאכזב את עצמ|לא שווה|פחדתי|התביישתי)/i,
  },
  {
    intent: 'celebrate',
    mustReact: true,
    hint: 'חגיגה/גאווה',
    pattern:
      /(?:גאה בעצמ|סיימתי הכל|סיימתי את כל|הצלחתי|עשיתי את זה|ניצחתי|כל הכבוד לי|התקדמתי משמעות|שברתי שיא|proud of myself)/i,
  },
  {
    intent: 'thanks',
    mustReact: true,
    hint: 'תודה',
    pattern:
      /(?:תודה רבה|תודה לך|תודה שעזר|מעריך אותך|מעריכה אותך|תודה על|thanks a lot|thank you)/i,
  },
  {
    intent: 'joy',
    mustReact: true,
    hint: 'שמחה/התרגשות',
    pattern:
      /(?:מתרגש|מתרגשת|מרגש|מרגשת|וואו|וואלה כיף|שמח מאוד|שמחה מאוד|כיף לי|אנרגיה טובה|excited|amazing)/i,
  },
  {
    intent: 'relief',
    mustReact: true,
    hint: 'הקלה',
    pattern: /(?:התחלתי לנשום|נרגעתי|נרגע|יותר קל|ירד לי מהלב|סוף סוף)/i,
  },
  {
    intent: 'encourage',
    mustReact: true,
    hint: 'צריך עידוד',
    pattern: /(?:אני מנסה|אתחיל מחדש|בוא ננסה|רוצה להצליח|תעודד|תני לי כוח|תן לי כוח)/i,
  },
  {
    intent: 'micro_win',
    mustReact: true,
    hint: 'ניצחון קטן',
    pattern:
      /(?:שתיתי|עשיתי|סיימתי|ביצעתי|הלכתי|רצתי|התאמנתי|ישנתי טוב|אכלתי טוב|מדיטציה)(?:\s|$|!|\.|,)/i,
  },
  {
    intent: 'focus',
    mustReact: false,
    hint: 'מיקוד/כוונה',
    pattern: /(?:אני מתחייב|אני מתחייבת|המטרה שלי|היום אני אעשה|בלי תירוצים)/i,
  },
  {
    intent: 'gentle_humor',
    mustReact: false,
    hint: 'הומור עדין',
    pattern: /(?:😂|🤣|חחח|ההה|זה מצחיק|בדיחה)/i,
  },
  {
    intent: 'warmth',
    mustReact: false,
    hint: 'חום/קרבה',
    pattern: /(?:אתה חשוב|אתה עוזר|טוב שיש אותך|שמח שאתה כאן|אוהב את השיחות)/i,
  },
];

type PoolOption = {
  emoji: string;
  verb: string;
  /** אם מתאים להודעה — עדיף על בחירה אקראית מהמאגר */
  when?: RegExp;
};

const FALLBACK_POOLS: Record<ReactionIntent, PoolOption[]> = {
  crisis_care: [
    { emoji: '🫂', verb: 'מחבק' },
    { emoji: '🤍', verb: 'איתך' },
    { emoji: '💙', verb: 'תומך' },
  ],
  support: [
    { emoji: '💙', verb: 'תומך', when: /תמיכה|קשה|עצוב/i },
    { emoji: '🤗', verb: 'מחבק', when: /לבד|בודד|חיבוק/i },
    { emoji: '🫂', verb: 'איתך', when: /נשבר|מיואש|אין לי כוח/i },
    { emoji: '🤍', verb: 'מרגיע', when: /חרד|מפחד|מציף/i },
    { emoji: '🌧️', verb: 'מבין', when: /בוכה|דמע|כואב/i },
    { emoji: '🕊️', verb: 'מרגיע' },
    { emoji: '🩵', verb: 'תומך' },
    { emoji: '🥺', verb: 'הזדהה' },
  ],
  empathy: [
    { emoji: '🤍', verb: 'הזדהה' },
    { emoji: '💙', verb: 'מבין' },
    { emoji: '🫶', verb: 'מקבל' },
    { emoji: '😌', verb: 'מרגיע' },
  ],
  celebrate: [
    { emoji: '💪', verb: 'חיזק', when: /גאה|הצלח|ניצח/i },
    { emoji: '🏆', verb: 'חוגג', when: /שיא|ניצח|הצלחתי/i },
    { emoji: '🎉', verb: 'חוגג', when: /סיימתי את כל|הכל/i },
    { emoji: '🌟', verb: 'גאה בך' },
    { emoji: '🚀', verb: 'מעודד' },
    { emoji: '🔥', verb: 'מתלהב' },
    { emoji: '🙌', verb: 'מחא כפיים' },
    { emoji: '✨', verb: 'מאיר' },
  ],
  micro_win: [
    { emoji: '💧', verb: 'ציין', when: /שתית|מים/i },
    { emoji: '🚶', verb: 'מחא כפיים', when: /הלכתי|הליכה|צעדים/i },
    { emoji: '🏃', verb: 'מחא כפיים', when: /רצתי|ריצה|התאמנ/i },
    { emoji: '😴', verb: 'שמח איתך', when: /ישנתי|שינה/i },
    { emoji: '🥗', verb: 'ציין', when: /אכלתי|ירק|סלט/i },
    { emoji: '🧘', verb: 'מחא כפיים', when: /מדיט|נשימ/i },
    { emoji: '👏', verb: 'מחא כפיים' },
    { emoji: '✅', verb: 'ציין' },
    { emoji: '🌱', verb: 'מעודד' },
  ],
  thanks: [
    { emoji: '❤️', verb: 'אהב' },
    { emoji: '🙏', verb: 'מעריך' },
    { emoji: '💕', verb: 'אהב' },
    { emoji: '🌹', verb: 'מחמם' },
    { emoji: '😊', verb: 'חייך' },
    { emoji: '🫶', verb: 'מודה' },
  ],
  joy: [
    { emoji: '✨', verb: 'שמח איתך' },
    { emoji: '😄', verb: 'שמח איתך' },
    { emoji: '🌈', verb: 'שמח איתך' },
    { emoji: '🌞', verb: 'מאיר' },
    { emoji: '🎊', verb: 'חוגג' },
    { emoji: '💫', verb: 'מתרגש' },
  ],
  encourage: [
    { emoji: '💪', verb: 'עודד' },
    { emoji: '🌱', verb: 'מעודד' },
    { emoji: '🔆', verb: 'עודד' },
    { emoji: '👊', verb: 'איתך' },
    { emoji: '🛤️', verb: 'מעודד' },
  ],
  warmth: [
    { emoji: '💛', verb: 'מחמם' },
    { emoji: '🤗', verb: 'מחבק' },
    { emoji: '😌', verb: 'מחמם' },
    { emoji: '🌸', verb: 'מחמם' },
  ],
  relief: [
    { emoji: '😮‍💨', verb: 'נשם איתך' },
    { emoji: '🌿', verb: 'מרגיע' },
    { emoji: '😌', verb: 'שמח איתך' },
    { emoji: '☀️', verb: 'מאיר' },
  ],
  focus: [
    { emoji: '🎯', verb: 'מכוון' },
    { emoji: '📌', verb: 'ציין' },
    { emoji: '⚡', verb: 'מעודד' },
  ],
  gentle_humor: [
    { emoji: '😊', verb: 'חייך' },
    { emoji: '🙂', verb: 'חייך' },
    { emoji: '😉', verb: 'חייך' },
  ],
};

const DRY_QUESTION =
  /^(?:מה|איך|מתי|כמה|האם|למה|איפה|who|what|when|how|why)\b/i;

function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % modulo;
}

export function detectReactionSignal(userMessage: string): ReactionSignal | null {
  const t = userMessage.trim();
  if (t.length < 4) return null;

  if (t.length < 80 && DRY_QUESTION.test(t) && !/(קשה|עצוב|גאה|תודה|לב|שמח)/i.test(t)) {
    return null;
  }

  for (const rule of INTENT_RULES) {
    if (!rule.pattern.test(t)) continue;
    return {
      intent: rule.intent,
      mustReact: rule.mustReact,
      hints: [rule.hint],
    };
  }

  return null;
}

/**
 * בוחר אימוג'י מהמאגר לפי תוכן ההודעה (התאמה ספציפית) או פיזור יציב.
 */
export function pickFallbackReaction(
  intent: ReactionIntent,
  userMessage: string
): MentorEmojiReaction {
  const pool = FALLBACK_POOLS[intent] ?? FALLBACK_POOLS.warmth;
  const contextual = pool.find((opt) => opt.when && opt.when.test(userMessage));
  if (contextual) {
    return { emoji: contextual.emoji, verb: contextual.verb };
  }
  const pick = pool[stableIndex(userMessage, pool.length)] ?? pool[0]!;
  return { emoji: pick.emoji, verb: pick.verb };
}

/**
 * נפילה מלאה: כוונה + אימוג'י מהמאגר. null אם אין אות רגשי.
 */
export function heuristicEmojiReaction(userMessage: string): MentorEmojiReaction | null {
  const signal = detectReactionSignal(userMessage);
  if (!signal || !signal.mustReact) return null;
  return pickFallbackReaction(signal.intent, userMessage);
}

/** האם האימוג'י נשמע כצחוק/לעג — אסור על כאב. */
export function isInappropriateLaughEmoji(emoji: string): boolean {
  return /[😂🤣💀]/u.test(emoji);
}

export function isVulnerableIntent(intent: ReactionIntent | null | undefined): boolean {
  return intent === 'crisis_care' || intent === 'support' || intent === 'empathy';
}
