import { openrouter } from '../client';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from '../rag-config';
import { formatTranscriptForLlm } from './fetch-transcript';
import type { ChatTranscriptTurn } from './types';

/**
 * סיכום קצר של שיחה לסגירת סשן — 2–4 משפטים בעברית.
 */
export async function summarizeChatSession(turns: ChatTranscriptTurn[]): Promise<string> {
  const transcript = formatTranscriptForLlm(turns);
  if (!transcript.trim()) {
    return 'שיחה קצרה ללא תוכן משמעותי לסיכום.';
  }

  const clipped =
    transcript.length > 12_000 ? `${transcript.slice(0, 12_000)}\n…[קוצץ]` : transcript;

  const completion = await openrouter.chat.completions.create({
    model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
    temperature: 0.2,
    max_tokens: 280,
    messages: [
      {
        role: 'system',
        content: `אתה מסכם שיחות ליווי בריאות (NuraWell) בעברית.
החזר 2–4 משפטים קצרים: מה עלה בשיחה, איך המשתמש הרגיש, ומה הצעד/הכוונה הבאה אם הייתה.
בלי כותרות, בלי markdown, בלי JSON — רק טקסט רציף.`,
      },
      { role: 'user', content: `תמליל השיחה:\n\n${clipped}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  return raw || 'סיכום השיחה לא זמין כרגע.';
}
