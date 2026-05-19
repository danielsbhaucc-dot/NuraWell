import type { ModelMessage } from 'ai';

const CONTINUE_USER = `המשך בדיוק מהנקודה שנעצרת. אל תחזור על מה שכבר נכתב. סיים את המשפט/הפסקה האחרונה ואת ההודעה — בלי לפתוח נושא חדש.`;

export type GenerateChunkResult = {
  text: string;
  finishReason?: string;
};

/**
 * ממזג מקטעי טקסט עד שהמודל סיים (לא finishReason === 'length').
 * מונע הודעות שנקטעות באמצע משפט.
 */
export async function stitchModelTextUntilComplete(
  initial: GenerateChunkResult,
  continueGenerate: (messages: ModelMessage[]) => Promise<GenerateChunkResult>,
  baseMessages: ModelMessage[],
  options?: { maxContinuations?: number }
): Promise<string> {
  const maxContinuations = options?.maxContinuations ?? 2;
  let combined = (initial.text ?? '').trim();
  let finishReason = initial.finishReason;
  const messages: ModelMessage[] = [...baseMessages];

  if (combined) {
    messages.push({ role: 'assistant', content: combined });
  }

  let continuations = 0;
  while (finishReason === 'length' && continuations < maxContinuations) {
    messages.push({ role: 'user', content: CONTINUE_USER });
    const next = await continueGenerate(messages);
    const piece = (next.text ?? '').trim();
    if (piece) {
      combined = combined ? `${combined} ${piece}` : piece;
      messages.push({ role: 'assistant', content: piece });
    }
    finishReason = next.finishReason;
    continuations++;
    if (!piece) break;
  }

  return combined.trim();
}
