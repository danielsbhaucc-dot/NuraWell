/**
 * קיצוץ טקסט לפי graphemes (לא בתים / code units) — חשוב לעברית ולאימוג'ים.
 * מעדיף גבול מילה ומוסיף "…" כשנחתך.
 */

function segmentGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  // Fallback: [...str] מפצל surrogate pairs; grapheme clusters מורכבים עלולים להישבר.
  return [...text];
}

function isWordBoundaryChar(ch: string): boolean {
  return /\s|[–—־,.;:!?'"”)\]}]/.test(ch);
}

/**
 * מקצר ל־`maxGraphemes` graphemes לכל היותר.
 * אם הטקסט ארוך יותר — חותך בגבול מילה הקרוב (אם יש) ומוסיף "…".
 */
export function truncateAtWordBoundary(text: string, maxGraphemes: number): string {
  const trimmed = text.trim();
  if (!trimmed || maxGraphemes <= 0) return '';

  const graphemes = segmentGraphemes(trimmed);
  if (graphemes.length <= maxGraphemes) return trimmed;

  const hardCap = Math.max(1, maxGraphemes);
  let cut = hardCap;

  // חפש גבול מילה אחורה (לא פחות מ־40% מהמגבלה, כדי לא לקצר יתר על המידה).
  const minKeep = Math.max(1, Math.floor(hardCap * 0.4));
  for (let i = hardCap - 1; i >= minKeep; i--) {
    if (isWordBoundaryChar(graphemes[i]!)) {
      cut = i;
      break;
    }
    // גם אם התו הבא הוא רווח — חתוך לפניו
    if (i + 1 < graphemes.length && isWordBoundaryChar(graphemes[i + 1]!)) {
      cut = i + 1;
      break;
    }
  }

  // אל תשאיר רווחים / פיסוק בקצה לפני ה־ellipsis
  while (cut > 0 && isWordBoundaryChar(graphemes[cut - 1]!)) {
    cut -= 1;
  }
  if (cut < 1) cut = Math.min(hardCap, graphemes.length);

  return `${graphemes.slice(0, cut).join('')}…`;
}
