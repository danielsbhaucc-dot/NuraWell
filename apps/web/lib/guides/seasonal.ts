/** זיהוי מדריכים עונתיים וסגירה אוטומטית אחרי שהעונה עברה. */

export type GuideSeasonTag = 'passover' | 'rosh_hashana' | 'sukkot' | 'shavuot' | 'general';

const SEASON_KEYWORDS: Array<{ tag: GuideSeasonTag; patterns: RegExp[] }> = [
  { tag: 'passover', patterns: [/פסח/i, /חג המצות/i] },
  { tag: 'rosh_hashana', patterns: [/ראש השנה/i, /יום כיפור/i, /ימים נוראים/i, /סליחות/i] },
  { tag: 'sukkot', patterns: [/סוכות/i, /שמחת תורה/i] },
  { tag: 'shavuot', patterns: [/שבועות/i] },
];

/** מזהה תג עונתי לפי כותרת/תיאור המדריך. */
export function detectGuideSeasonTag(title: string, description?: string | null): GuideSeasonTag {
  const text = `${title} ${description ?? ''}`;
  for (const entry of SEASON_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(text))) return entry.tag;
  }
  return 'general';
}

/**
 * האם מדריך עונתי עדיין רלוונטי לפי תאריך אזרחי (Asia/Jerusalem).
 * חלונות משוערים — מספיק לסגירה אוטומטית אחרי החג.
 */
export function isGuideSeasonallyActive(
  tag: GuideSeasonTag,
  now: Date = new Date()
): boolean {
  if (tag === 'general') return true;

  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  switch (tag) {
    case 'passover':
      // רלוונטי מפברואר עד סוף אפריל
      return month < 5 || (month === 2) || (month === 3) || (month === 4 && day <= 30);
    case 'rosh_hashana':
      // אוגוסט–אוקטובר
      return month >= 8 && month <= 10;
    case 'sukkot':
      // ספטמבר–אוקטובר
      return month >= 9 && month <= 10;
    case 'shavuot':
      // אפריל–יוני
      return month >= 4 && month <= 6;
    default:
      return true;
  }
}

export function seasonInactiveReason(tag: GuideSeasonTag): string {
  switch (tag) {
    case 'passover':
      return 'חג הפסח עבר — המדריך כבר לא רלוונטי לעונה הזו';
    case 'rosh_hashana':
      return 'תקופת ראש השנה עברה — המדריך כבר לא רלוונטי לעונה הזו';
    case 'sukkot':
      return 'חג הסוכות עבר — המדריך כבר לא רלוונטי לעונה הזו';
    case 'shavuot':
      return 'חג השבועות עבר — המדריך כבר לא רלוונטי לעונה הזו';
    default:
      return 'המדריך כבר לא רלוונטי';
  }
}
