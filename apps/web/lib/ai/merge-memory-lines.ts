import { openrouter } from './client';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from './rag-config';

function tryParseMerged(text: string): string | null {
  try {
    const t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fence ? fence[1] : t).trim();
    const o = JSON.parse(body) as { merged?: unknown };
    if (typeof o.merged === 'string' && o.merged.trim()) {
      return o.merged.replace(/\s+/g, ' ').trim().slice(0, 500);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * מאחד שני משפטי זיכרון קרובים (למשל "קשה בסופ"ש" + "קשה בשבת") לשורה אחת.
 */
export async function mergeTwoUserMemoryLines(a: string, b: string): Promise<string> {
  const left = a.replace(/\s+/g, ' ').trim();
  const right = b.replace(/\s+/g, ' ').trim();
  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;
  if (left.includes(right) || right.includes(left)) {
    return left.length >= right.length ? left : right;
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: `אתה ממזג שני משפטי "זיכרון" קצרים של משתמש בליווי בריאות/משקל.
החזר JSON בלבד: {"merged":"..."} — משפט עברי אחד, עד 260 תווים, בלי כפילות מידע.
אם אחד מהם לא רלוונטי לבריאות — התעלם ממנו והחזר את הרלוונטי בלבד בתוך merged.`,
        },
        {
          role: 'user',
          content: `שורה א: ${left}\nשורה ב: ${right}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const merged = tryParseMerged(raw);
    if (merged) return merged;
  } catch {
    /* fallback */
  }

  return `${left} — ${right}`.slice(0, 500);
}
