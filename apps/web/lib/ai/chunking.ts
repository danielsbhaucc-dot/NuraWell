/**
 * פיצול דטרמיניסטי של טקסט ארוך לצ'אנקים (ללא LLM).
 * ברירת מחדל: עד ~800 תווים לצ'אןק, חפיפה ~10%, ניסיון לשבור על רווחים כשאפשר.
 */

export type TextChunkOptions = {
  /** אורך מקסימלי לצ'אנק (ברירת מחדל 800). */
  maxChunkChars?: number;
  /** אורך מינימלי לפני שמנסים לשבור על רווח (ברירת מחדל 500). */
  minChunkChars?: number;
  /** יחס חפיפה בין צ'אנקים (ברירת מחדל 0.1 = 10%). */
  overlapRatio?: number;
};

const WS = /\s/;

function trimOuter(s: string): string {
  return s.replace(/^\s+/, '').replace(/\s+$/, '');
}

/**
 * מחזיר מערך צ'אנקים לא ריקים. טקסט ריק → מערך ריק.
 */
export function chunkLongText(raw: string, options?: TextChunkOptions): string[] {
  const maxChunkChars = options?.maxChunkChars ?? 800;
  const minChunkChars = options?.minChunkChars ?? 500;
  const overlapRatio = options?.overlapRatio ?? 0.1;

  if (maxChunkChars < 16) {
    throw new Error('chunkLongText: maxChunkChars too small');
  }
  if (minChunkChars < 1 || minChunkChars > maxChunkChars) {
    throw new Error('chunkLongText: minChunkChars must be between 1 and maxChunkChars');
  }
  if (overlapRatio < 0 || overlapRatio >= 1) {
    throw new Error('chunkLongText: overlapRatio must be in [0, 1)');
  }

  const normalized = raw.replace(/\r\n/g, '\n');
  const t = trimOuter(normalized);
  if (!t) return [];

  const overlap = Math.max(1, Math.round(maxChunkChars * overlapRatio));
  const out: string[] = [];
  let i = 0;

  while (i < t.length) {
    const remaining = t.length - i;
    if (remaining <= maxChunkChars) {
      const rest = trimOuter(t.slice(i));
      if (rest) out.push(rest);
      break;
    }

    const hardEnd = i + maxChunkChars;
    let cut = hardEnd;

    const minAbs = i + minChunkChars;
    for (let j = hardEnd - 1; j >= minAbs; j--) {
      if (WS.test(t[j])) {
        cut = j;
        break;
      }
    }

    const chunk = trimOuter(t.slice(i, cut));
    if (chunk) out.push(chunk);

    let next = cut - overlap;
    if (next <= i) {
      next = cut;
    }
    i = next;
    while (i < t.length && WS.test(t[i])) {
      i += 1;
    }
  }

  return out;
}
