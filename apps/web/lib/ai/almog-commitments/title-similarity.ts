/**
 * השוואת כותרות משימות — Jaccard על אסימונים + הכלה חלקית.
 * מודול טהור (בלי Supabase) — בטוח לייבוא ב-SSOT / UI / persist.
 */

/** מנרמל טקסט עברי/אנגלי למפתח dedupe יציב. */
export function normalizeTitleKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** אסימונים משמעותיים להשוואת דמיון (M2). */
export function significantTokens(text: string): Set<string> {
  const stop = new Set([
    'של',
    'את',
    'על',
    'עם',
    'או',
    'גם',
    'זה',
    'זו',
    'היא',
    'הוא',
    'אני',
    'כל',
    'רק',
    'לי',
    'לך',
  ]);
  return new Set(
    normalizeTitleKey(text)
      .split(' ')
      .filter((t) => t.length >= 2 && !stop.has(t))
  );
}

/** גזע גס לעברית — תופס יחיד/רבים נפוצים (כוס/כוסות, צלחת/צלחות). */
function stemHebrewToken(token: string): string {
  return token
    .replace(/יות$/u, '')
    .replace(/ות$/u, '')
    .replace(/ים$/u, '')
    .replace(/יין$/u, '')
    .replace(/ת$/u, '')
    .replace(/ה$/u, '');
}

/** התאמת אסימון כולל קידומת/גזע (כוס ≈ כוסות). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stemHebrewToken(a);
  const sb = stemHebrewToken(b);
  if (sa.length >= 2 && sb.length >= 2 && sa === sb) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return (
    shorter.length >= 2 &&
    longer.startsWith(shorter) &&
    shorter.length / longer.length >= 0.5
  );
}

function setHasToken(set: Set<string>, token: string): boolean {
  for (const t of set) {
    if (tokensMatch(t, token)) return true;
  }
  return false;
}

/**
 * דמיון חלקי בין כותרות — Jaccard על אסימונים, או הכלה כמעט מלאה.
 * מונע לולאת "כוסות ליד הצלחת" / "חצי כוס" מסיכומי שיחה.
 */
export function titlesAreSimilar(a: string, b: string, threshold = 0.55): boolean {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let intersection = 0;
  for (const t of ta) if (setHasToken(tb, t)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  if (union === 0) return false;
  const jaccard = intersection / union;
  if (jaccard >= threshold) return true;
  const smaller = ta.size <= tb.size ? ta : tb;
  const larger = ta.size <= tb.size ? tb : ta;
  let contained = 0;
  for (const t of smaller) if (setHasToken(larger, t)) contained += 1;
  return contained / smaller.size >= 0.8;
}

export type SimilarTitleGroup<T extends { id: string; title: string }> = T & {
  /** כל המזהים בקבוצה (כולל הנציג). */
  groupedIds: string[];
  /** כמה וריאציות קרובות אוחדו לתצוגה. */
  similarCount: number;
};

/**
 * מקבץ פריטים עם כותרות כמעט-זהות. הנציג הוא הכותרת הקצרה ביותר
 * (בדרך כלל הניסוח הנקי ביותר).
 */
export function groupSimilarByTitle<T extends { id: string; title: string }>(
  items: T[],
  threshold = 0.55
): SimilarTitleGroup<T>[] {
  const result: SimilarTitleGroup<T>[] = [];
  const used = new Set<string>();

  for (const item of items) {
    if (used.has(item.id)) continue;
    const group: T[] = [item];
    used.add(item.id);

    for (const other of items) {
      if (used.has(other.id)) continue;
      // השוואה מול כל חברי הקבוצה — תופס שרשרת ניסוחים קרובים.
      if (group.some((g) => titlesAreSimilar(g.title, other.title, threshold))) {
        group.push(other);
        used.add(other.id);
      }
    }

    const primary = [...group].sort((a, b) => {
      const len = a.title.trim().length - b.title.trim().length;
      if (len !== 0) return len;
      return a.id.localeCompare(b.id);
    })[0]!;

    result.push({
      ...primary,
      groupedIds: group.map((g) => g.id),
      similarCount: group.length,
    });
  }

  return result;
}
