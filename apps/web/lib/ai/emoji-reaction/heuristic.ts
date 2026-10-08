/**
 * נפילה דטרמיניסטית — כשיש מסר רגשי ברור, תמיד מגיבים באימוג'י מדויק
 * (גם אם ה-LLM איטי/נכשל/שמרני מדי).
 */

import type { MentorEmojiReaction } from './types';

type Rule = {
  pattern: RegExp;
  reaction: MentorEmojiReaction;
};

/** סדר = עדיפות (ראשון שמתאים מנצח). */
const RULES: Rule[] = [
  {
    pattern:
      /(?:רוצה למות|לא רוצה לחיות|לפגוע בעצמ|להתאבד|suicidal|kill myself)/i,
    reaction: { emoji: '🫂', verb: 'מחבק' },
  },
  {
    pattern:
      /(?:קשה לי|עצוב|עצובה|נשבר|נשברה|מיואש|מיואשת|לבד|בודד|בודדה|מפחד|מפחדת|חרד|חרדה|כואב|בוכה|דמע|מדוכא|מדוכאת|אין לי כוח|לא מצליח|לא מצליחה|נכשל|נכשלתי|מותש|מותשת|מותש\b|מרגיש רע|מרגישה רע|צריך תמיכה|צריכה תמיכה|תתמוך|תרגיע)/i,
    reaction: { emoji: '💙', verb: 'תומך' },
  },
  {
    pattern:
      /(?:גאה|גאה בעצמ|סיימתי הכל|סיימתי את כל|הצלחתי|עשיתי את זה|ניצחתי|כל הכבוד לי|התקדמתי|שברתי שיא|closed all|proud of myself)/i,
    reaction: { emoji: '💪', verb: 'חיזק' },
  },
  {
    pattern: /(?:תודה רבה|תודה לך|תודה שעזר|מעריך אותך|מעריכה אותך|thanks a lot|thank you)/i,
    reaction: { emoji: '❤️', verb: 'אהב' },
  },
  {
    pattern: /(?:מתרגש|מתרגשת|מרגש|מרגשת|וואו|וואלה כיף|שמח מאוד|שמחה מאוד|excited)/i,
    reaction: { emoji: '✨', verb: 'שמח איתך' },
  },
  {
    pattern: /(?:שתיתי|עשיתי|סיימתי|ביצעתי|הלכתי|רצתי)(?:\s|$|!|\.)/i,
    reaction: { emoji: '👏', verb: 'מחא כפיים' },
  },
];

const DRY_QUESTION =
  /^(?:מה|איך|מתי|כמה|האם|למה|איפה|who|what|when|how|why)\b/i;

/**
 * מחזיר תגובה דטרמיניסטית כשיש מסר רגשי/חברתי ברור; אחרת null.
 */
export function heuristicEmojiReaction(userMessage: string): MentorEmojiReaction | null {
  const t = userMessage.trim();
  if (t.length < 4) return null;

  /** שאלה יבשה קצרה בלי רגש — לא מגיבים. */
  if (t.length < 80 && DRY_QUESTION.test(t) && !/(קשה|עצוב|גאה|תודה|לב)/i.test(t)) {
    return null;
  }

  for (const rule of RULES) {
    if (rule.pattern.test(t)) return { ...rule.reaction };
  }

  return null;
}
