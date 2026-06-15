/**
 * סניטציה של HTML מהמסד (תוכן שיעור). ללא תלות חיצונית — מתאים גם כש־npm חסום (TLS).
 * בשימוש בצד שרת (lessons page) ובצד לקוח (LessonPageClient) — הגנה לעומק.
 *
 * הערה: סניטציה מבוססת regex היא שכבת הגנה — התוכן מגיע מה-DB (נכתב ע"י מנהלים),
 * וה-CSP (nonce, ללא 'unsafe-inline') הוא שכבת הגנה נוספת. עדיין מקשיחים כאן
 * אגרסיבית: מסירים תגיות מסוכנות, מאפייני אירוע (on*), וכל href/src/xlink:href
 * שערכו — אחרי פענוח entities והסרת רווחים/בקרה — מצביע לסכימה מסוכנת
 * (javascript:/vbscript:/data:). כך נסגרות עקיפות נפוצות כמו `&#106;avascript:`,
 * טאב/רווח בתוך הסכימה, ומפריד `/` במקום רווח לפני שם המאפיין.
 */

const DANGEROUS_SCHEME = /^(?:javascript|vbscript|data):/i;

/** פענוח entities מספריות (&#106; / &#x6a;) + entities נפוצות הרלוונטיות לעקיפות. */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);?/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&colon;/gi, ':')
    .replace(/&amp;/gi, '&');
}

/**
 * האם ערך URL (של href/src/xlink:href) מצביע לסכימה מסוכנת?
 * מנרמל בדיוק כמו שדפדפן עושה: מסיר מרכאות עוטפות, מפענח entities,
 * ומסיר רווחים/תווי בקרה (שדפדפנים מתעלמים מהם בתוך הסכימה).
 */
function isDangerousUrlValue(rawValue: string): boolean {
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = decodeHtmlEntities(value);
  // הסרת כל הרווחים ותווי הבקרה (כולל \t \n \r ו-NBSP) — דפדפנים מתעלמים מהם בסכימה.
  // משתמשים בסינון לפי קוד תו (ולא regex עם תווי בקרה ספרותיים) כדי לא לפגוע בקריאוּת/לינטינג.
  value = Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x20 && code !== 0xa0;
    })
    .join('');
  return DANGEROUS_SCHEME.test(value);
}

export function sanitizeLessonHtml(html: string | null | undefined): string {
  if (!html) return '';

  let s = html.replace(/<!--[\s\S]*?-->/g, '');

  for (let i = 0; i < 4; i++) {
    s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
    s = s.replace(/<embed\b[^>]*>/gi, '');
  }

  s = s.replace(/<\/?(?:script|iframe|object|embed|applet|meta|link|base)\b[^>]*>/gi, '');

  // הסרת מאפייני אירוע (onclick, onload, ontoggle וכו') + formaction.
  // המפריד לפני שם המאפיין יכול להיות רווח *או* '/' (כמו `<a/onclick=...>`).
  s = s.replace(
    /[\s/](?:on[a-z]{2,}|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ' ',
  );

  // נטרול href/src/xlink:href/action/formaction עם סכימה מסוכנת —
  // אחרי פענוח entities והסרת רווחים/בקרה (סוגר עקיפות encoding/whitespace).
  s = s.replace(
    /([\s/])(href|src|xlink:href|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, sep: string, _attr: string, value: string) =>
      isDangerousUrlValue(value) ? sep : match,
  );

  return s;
}
