/** Pure health-text detection (client-safe: no server imports). */
const HEALTH_RE = new RegExp(
  [
    // Hebrew
    'משקל', 'שוקל', 'שוקלת', 'קילו', 'ק"ג', 'ק״ג', 'ירדתי\\s*\\d', 'עליתי\\s*\\d', 'גובה', 'מותניים',
    'אחוז\\s*שומן', 'BMI', 'סוכרת', 'לחץ\\s*דם', 'כולסטרול', 'תרופ', 'מחלה', 'מחלת', 'אבחנ', 'אובחנ', 'רופא',
    'דיאטנ', 'בריאות', 'בריאותי', 'אלרגי', 'גלוטן', 'צליאק', 'לקטוז', 'הריון', 'בהריון', 'הפרעת\\s*אכילה',
    'בולמוס', 'אנורקס', 'בולימי', 'דיכאון', 'חרדה', 'ניתוח', 'בלוטת\\s*התריס', 'תת\\s*פעילות', 'אינסולין',
    'כאב(?:י)?\\s*(?:גב|ברכיים|ראש)', 'אסטמה', 'פציעה', 'צמחוני', 'טבעוני', 'כשרות\\s*תזונ',
    // English
    'weight', '\\bkg\\b', 'kilos?', 'height', 'waist', 'body\\s*fat', 'diabet', 'blood\\s*pressure', 'cholesterol',
    'medicat', 'diagnos', 'allerg', 'gluten', 'lactose', 'pregnan', 'eating\\s*disorder', 'insulin', 'thyroid',
    'depress', 'anxiety', 'injur', 'vegan', 'vegetarian',
  ].join('|'),
  'i'
);

export const HEALTH_MEMORY_CATEGORIES: ReadonlySet<string> = new Set(['health']);

export function isHealthText(text: unknown): boolean {
  return typeof text === 'string' && HEALTH_RE.test(text);
}

export function isHealthMemory(category: unknown, text: unknown): boolean {
  return (typeof category === 'string' && HEALTH_MEMORY_CATEGORIES.has(category)) || isHealthText(text);
}

/** Removes sentences that mention health facts; keeps the rest of the text. */
export function redactHealthSentences(text: string): string {
  if (!isHealthText(text)) return text;
  return text
    .split(/(?<=[.!?\n])\s+/)
    .filter((s) => !isHealthText(s))
    .join(' ')
    .trim();
}
