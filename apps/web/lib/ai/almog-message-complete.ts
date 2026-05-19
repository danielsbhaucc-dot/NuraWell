import type { ModelMessage } from 'ai';

const CONTINUE_USER =
  'המשך בדיוק מהנקודה שנעצרת. אל תחזור על מה שכבר נכתב. סיים את המשפט/הפסקה האחרונה בלבד.';

/** האם נראה שהטקסט הסתיים במשפט שלם (פחות סיכוי שצריך המשכה יקרה). */
export function looksLikeCompleteHebrewMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const last = t.slice(-1);
  if (/[.!?…]/.test(last)) return true;
  if (/[\u05C3\u05C0]/.test(last)) return true;
  if (t.endsWith(')') || t.endsWith('"') || t.endsWith("'")) return true;
  return false;
}

export type GenerateChunkResult = {
  text: string;
  finishReason?: string;
};

export type StitchOptions = {
  maxContinuations?: number;
  /** המשכה בלי לשלוח שוב system + היסטוריה — חוסך טוקני קלט */
  lightweightContinue?: (partialAssistant: string) => Promise<GenerateChunkResult>;
};

/**
 * ממזג מקטעי טקסט עד שהמודל סיים (לא finishReason === 'length')
 * או שהטקסט נראה שלם.
 */
export async function stitchModelTextUntilComplete(
  initial: GenerateChunkResult,
  continueGenerate: (messages: ModelMessage[]) => Promise<GenerateChunkResult>,
  baseMessages: ModelMessage[],
  options?: StitchOptions
): Promise<string> {
  const maxContinuations = options?.maxContinuations ?? 1;
  let combined = (initial.text ?? '').trim();
  let finishReason = initial.finishReason;

  if (
    finishReason !== 'length' ||
    looksLikeCompleteHebrewMessage(combined) ||
    maxContinuations === 0
  ) {
    return combined;
  }

  for (let i = 0; i < maxContinuations; i++) {
    const next = options?.lightweightContinue
      ? await options.lightweightContinue(combined)
      : await continueGenerate([
          ...baseMessages,
          { role: 'assistant', content: combined },
          { role: 'user', content: CONTINUE_USER },
        ]);

    const piece = (next.text ?? '').trim();
    if (piece) combined = `${combined} ${piece}`.trim();
    finishReason = next.finishReason;
    if (finishReason !== 'length' || looksLikeCompleteHebrewMessage(combined)) break;
    if (!piece) break;
  }

  return combined.trim();
}
