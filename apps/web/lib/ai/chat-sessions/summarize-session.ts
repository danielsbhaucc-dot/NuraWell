import { openrouter } from '../client';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from '../rag-config';
import { formatTranscriptForLlm } from './fetch-transcript';
import type { ChatTranscriptTurn } from './types';

/**
 * סגירת סשן → נקודות מפתח מתוארכות (רזות, לזיכרון). רץ פעם אחת לשיחה, על מודל זול.
 * פורמט: "• [YYYY-MM-DD] נקודה" — 2–6 שורות, עובדות/שינויים/הסכמות בלבד.
 */
export async function summarizeChatSession(turns: ChatTranscriptTurn[]): Promise<string> {
  const transcript = formatTranscriptForLlm(turns);
  if (!transcript.trim()) {
    return 'שיחה קצרה ללא תוכן משמעותי לסיכום.';
  }

  const clipped =
    transcript.length > 12_000
      ? `${transcript.slice(0, 4_000)}\n…[קוצץ]…\n${transcript.slice(-8_000)}`
      : transcript;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

  const completion = await openrouter.chat.completions.create({
    model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: `אתה מתמצת שיחת ליווי (NuraWell) בין המשתמש לאלמוג (מנטור, לשון זכר) לזיכרון רזה בעברית.
החזר 2–6 שורות בדיוק בפורמט: • [${day}] נקודה קצרה
רק דברים שכדאי לזכור: עובדות חדשות על המשתמש, שינוי במצב (למשל "הפסיק לרוץ"), קושי מרכזי, הסכמה/משימה שקיבל, רגש בולט.
בלי תיאור של מה אלמוג אמר, בלי "הצעד הבא" כללי, בלי חזרות. שיחה בלי תוכן → שורה אחת.`,
      },
      { role: 'user', content: `תמליל השיחה:\n\n${clipped}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  return raw || 'סיכום השיחה לא זמין כרגע.';
}
