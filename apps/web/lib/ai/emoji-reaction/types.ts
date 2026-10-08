/**
 * תגובת אימוג'י של המנטור על הודעת משתמש (כמו לייק/לב בוואטסאפ).
 * client-safe — בלי תלות בשרת.
 */

export type MentorEmojiReaction = {
  /** אימוג'י יחיד (או רצף אימוג'י קצר, למשל ❤️‍🩹) */
  emoji: string;
  /**
   * פועל עברי קצר לטולטיפ — "אהב", "חיזק", "הזדהה", "עודד".
   * הטולטיפ: "{שם המנטור} {verb} {emoji}"
   */
  verb: string;
};

export const MENTOR_DISPLAY_NAME = 'אלמוג';

export function formatMentorReactionTooltip(
  reaction: MentorEmojiReaction,
  mentorName: string = MENTOR_DISPLAY_NAME
): string {
  const verb = reaction.verb.trim() || 'הגיב עם';
  return `${mentorName} ${verb} ${reaction.emoji}`.trim();
}
