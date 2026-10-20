/** Pure health-text detection (client-safe: no server imports). */
const HEALTH_RE = new RegExp(
  [
    // Hebrew
    'משקל', 'שוקל', 'שוקלת', 'קילו', 'ק"ג', 'ק״ג', 'ירדתי\\s*\\d', 'עליתי\\s*\\d', 'גובה', 'מותניים',
    'אחוז\\s*שומן', 'BMI', 'סוכרת', 'לחץ\\s*דם', 'כולסטרול', 'תרופ', 'מחלה', 'מחלת', 'אבחנ', 'אובחנ', 'רופא',
    'דיאטנ', 'בריאות', 'בריאותי', 'אלרגי', 'גלוטן', 'צליאק', 'לקטוז', 'הריון', 'בהריון', 'הפרעת\\s*אכילה',
    'בולמוס', 'אנורקס', 'בולימי', 'דיכאון', 'חרדה', 'ניתוח', 'בלוטת\\s*התריס', 'תת\\s*פעילות', 'אינסולין',
    'כאב(?:י)?\\s*(?:גב|ברכיים|ראש)', 'אסטמה', 'פציעה', 'צמחוני', 'טבעוני', 'כשרות\\s*תזונ',
    // Eating behaviour / eating disorders (Hebrew morphology: prefixes ו/ה/ב/ל/מ/ש/כ are covered because
    // matching is substring-based; stems cover gender/number suffixes)
    'אכיל(?:ה|ת)\\s*(?:רגשית|כפייתית|יתר|לילית|מלחץ|מתוך|משעמום|מתסכול|בלי\\s*שליטה)',
    'אוכל(?:ת|ים|ות)?\\s*(?:רגשי|מלחץ|מתוך\\s*(?:לחץ|רגש|שעמום|עצב)|משעמום|מעצב|מתסכול|בלי\\s*(?:שליטה|הפסקה)|בלילות|בסתר|כש(?:אני\\s*)?(?:לחוצ|עצוב|משועמ|כועס|בודד|עייפ))',
    'רגש(?:ות)?\\s*(?:ו|ל|מול\\s*ה|דרך\\s*ה)?אוכל', 'אוכל\\s*כ(?:נחמה|פיצוי|תגמול)',
    'זלל', 'זולל', 'זלילה', 'התקפ(?:י|ת|ים)?\\s*(?:אכילה|זלילה|רעב|חרדה|פאניקה|זעם)', 'לא\\s*(?:מצליח|מצליחה)?\\s*להפסיק\\s*לאכול',
    'לא\\s*מפסיק(?:ה)?\\s*לאכול', 'מתנפל(?:ת)?\\s*על\\s*(?:ה)?אוכל', 'מקיא', 'להקיא', 'הקאה', 'הקאות', 'משלשל',
    'הפרעו?ת\\s*(?:ה)?אכילה', 'אורתורקס', 'בינג', 'binge',
    // Diets / calorie restriction / fasting
    'דיאט', 'ספירת\\s*קלוריות', 'סופר(?:ת)?\\s*קלוריות', 'קלורי', 'צום\\s*(?:לסירוגין|ממושך)', 'צמה\\s*(?:לסירוגין|כדי)',
    'קיטוגני', 'קטוגני', 'הרזי', 'להרזות', 'מרזה', 'ירידה\\s*במשקל', 'עלייה\\s*במשקל', 'השמנ',
    // Body image
    'דימוי\\s*(?:ה)?גוף', 'שונא(?:ת)?\\s*את\\s*(?:ה)?גוף', 'שונא(?:ת)?\\s*(?:את\\s*)?(?:איך\\s*ש)?אני\\s*נרא',
    '(?:אני|מרגיש(?:ה)?|נראה|נראית)\\s*(?:כל\\s*כך\\s*)?(?:שמן|שמנה|שמנים|רזה|רזים|מכוער|מכוערת)', 'מתבייש(?:ת)?\\s*ב(?:גוף|עצמי)',
    // Emotional / mental health (clinical terms; general feelings like "לחוץ" alone are not health)
    'דיכאו', 'מדוכא', 'חרד(?:ה|ות|תי|תית)', 'פאניקה', 'פסיכולוג', 'פסיכיאטר', 'פסיכותרפ', 'טיפול\\s*(?:רגשי|פסיכולוגי|נפשי|תרופתי)',
    'מטפל(?:ת)?\\s*(?:רגשי|רגשית)', 'בריאות\\s*(?:ה)?נפש', 'מצב\\s*(?:ה)?נפשי', 'מצב\\s*רוח\\s*(?:ירוד|דיכאוני)', 'הפרע(?:ה|ת|ות)\\s*(?:נפשית|קשב|חרדה|אישיות|דו\\s*קוטבית)',
    'דו\\s*קוטבי', 'ביפולר', 'טראומ', 'פוסט\\s*טראומ', 'כפייתי', 'נדודי\\s*שינה', 'כדורי\\s*שינה', 'ריטלין', 'נוגדי\\s*דיכאון', 'כדורים\\s*(?:ל|נגד)',
    'פגיעה\\s*עצמית', 'פוגע(?:ת)?\\s*בעצמ',
    // English
    'emotional\\s*eating', 'stress\\s*eating', 'comfort\\s*eating', 'overeat', 'binge', 'purg', 'anorex', 'bulimi',
    'body\\s*image', '\\bdiet', 'keto', 'calorie', 'fasting', 'therap', 'psychiatr', 'psycholog', 'panic', '\\bocd\\b',
    '\\badhd\\b', '\\bptsd\\b', 'bipolar', 'trauma', 'self[\\s-]*harm', 'insomnia', 'mental\\s*health',
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
