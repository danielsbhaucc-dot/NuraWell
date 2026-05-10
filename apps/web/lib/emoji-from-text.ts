/**
 * בחירת אימוג'י לפי מילות מפתח (עברית + אנגלית) — ללא AI.
 * סדר החשיבות: לפי סדר הרשומות (ראשון שמתאים מנצח).
 */
const RULES: { pattern: RegExp; emoji: string }[] = [
  { pattern: /מים|שתייה|כוסות|בקבוק|hydrat|water|drink/i, emoji: '💧' },
  { pattern: /שינה|לילה|חצי שעה לפני שינה|sleep|insomnia|נומ/i, emoji: '😴' },
  { pattern: /הליכה|צעדים|10,?000|ריצה|רץ|אימון|כושר|walk|run|gym|exercise/i, emoji: '🏃' },
  { pattern: /ארוח|אוכל|בוקר|צהריים|ערב|meal|breakfast|lunch|dinner|food|eat/i, emoji: '🍽️' },
  { pattern: /ירקות|סלט|פירות|vegetable|fruit|salad/i, emoji: '🥗' },
  { pattern: /מתוק|סוכר|עוג|chocolate|sweet|sugar/i, emoji: '🍫' },
  { pattern: /טלפון|נייד|התראה|תזכורת|remind|alarm|phone|notification/i, emoji: '⏰' },
  { pattern: /נשימ|מדיט|מיינדפול|mindful|breath|relax|הרפיה/i, emoji: '🧘' },
  { pattern: /לחץ|סטרס|חרד|stress|anxiety/i, emoji: '🌿' },
  { pattern: /יומן|רשום|לעקוב|track|journal|log\b/i, emoji: '📝' },
  { pattern: /משקל|שקיל|scale|weight/i, emoji: '⚖️' },
  { pattern: /ויטמין|תוסף|supplement|vitamin/i, emoji: '💊' },
  { pattern: /מקרר|מזוון|prep|מטבח|kitchen/i, emoji: '🧊' },
  { pattern: /שולחן|עבודה|desk|משרד|office/i, emoji: '🖥️' },
  { pattern: /חבר|משפחה|ילדים|family|social/i, emoji: '👪' },
  { pattern: /מוזיקה|פודקאסט|podcast|music/i, emoji: '🎧' },
  { pattern: /ספר|קריאה|read|book/i, emoji: '📖' },
];

const DEFAULT_EMOJI = '✨';

export function emojiFromWellnessText(text: string, fallback: string = DEFAULT_EMOJI): string {
  const t = (text ?? '').trim();
  if (!t) return fallback.trim() || DEFAULT_EMOJI;
  const lower = t.toLowerCase();
  for (const { pattern, emoji } of RULES) {
    if (pattern.test(t) || pattern.test(lower)) return emoji;
  }
  const fb = fallback.trim();
  return fb || DEFAULT_EMOJI;
}
