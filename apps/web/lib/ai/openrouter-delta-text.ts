/**
 * חילוץ טקסט גלוי מזרם OpenRouter.
 * GPT-5.6 שולח חשיבה ב-delta.reasoning — אסור לבלבל את זה עם התשובה,
 * ואסור לפספס content במערך חלקים (output_text).
 */

type ContentPart = {
  type?: string;
  text?: string;
  output_text?: string;
};

function extractTextFromContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';
  return (raw as ContentPart[])
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        if (typeof part.text === 'string') return part.text;
        if (typeof part.output_text === 'string') return part.output_text;
      }
      return '';
    })
    .join('');
}

export function extractOpenRouterDeltaText(choice: {
  delta?: {
    content?: unknown;
    text?: unknown;
    reasoning?: unknown;
  };
  message?: { content?: unknown };
} | undefined): string {
  if (!choice) return '';
  const fromDelta =
    extractTextFromContent(choice.delta?.content) ||
    extractTextFromContent(choice.delta?.text);
  if (fromDelta) return fromDelta;
  return extractTextFromContent(choice.message?.content);
}
