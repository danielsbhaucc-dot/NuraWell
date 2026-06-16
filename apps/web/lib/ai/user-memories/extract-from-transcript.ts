import { openrouter } from '../client';
import type { ExtractedMemoryFact, MemoryInsightLevel } from '../extract-memory-facts';
import { dedupeExtractedFacts } from '../memory-fact-dedupe';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from '../rag-config';
import { MEMORY_FACT_CATEGORIES, type MemoryFactCategory } from '../memory-dossier/types';
function stripMarkdownFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function parseFactsPayload(raw: string): ExtractedMemoryFact[] {
  const stripped = stripMarkdownFences(raw);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const factsRaw = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(factsRaw)) return [];

  const allowed = new Set<string>(MEMORY_FACT_CATEGORIES);
  const facts: ExtractedMemoryFact[] = [];

  for (const item of factsRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const category = row.category;
    const text = row.text;
    const levelRaw = row.level;
    if (typeof category !== 'string' || !allowed.has(category)) continue;
    if (typeof text !== 'string') continue;
    const lv =
      typeof levelRaw === 'number' && [2, 3, 4].includes(levelRaw)
        ? (levelRaw as MemoryInsightLevel)
        : null;
    if (!lv) continue;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || clean.length > 600) continue;
    facts.push({ category: category as MemoryFactCategory, text: clean, level: lv });
  }

  return dedupeExtractedFacts(facts);
}

/**
 * חילוץ עובדות/יעדים/העדפות מתמליל סשן שלם — רקע בסגירת שיחה.
 */
export async function extractMemoriesFromTranscript(transcript: string): Promise<ExtractedMemoryFact[]> {
  const clipped =
    transcript.length > 14_000 ? `${transcript.slice(0, 14_000)}\n…[קוצץ]` : transcript;
  if (clipped.trim().length < 20) return [];

  const system = `אתה מנוע חילוץ זיכרונות לטווח ארוך מליווי בריאות (NuraWell).
קרא את תמליל השיחה המלא והחזר JSON בלבד:
{"facts":[{"category":"goal","text":"…","level":2|3|4}, ...]}

רמות: 2=דפוס חוזר, 3=תובנה, 4=שבירה. רק level 2–4.
קטגוריות: ${MEMORY_FACT_CATEGORIES.join(' | ')}.
שמור רק עובדות, יעדי בריאות, העדפות, חסמים, טריגרים שרלוונטיים לשיחות עתידיות.
אם אין מה לשמור — {"facts":[]}.
כל text: משפט אחד עד ~220 תווים בעברית.`;

  try {
    const completion = await openrouter.chat.completions.create({
      model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
      temperature: 0.15,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `תמליל:\n\n${clipped}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    return parseFactsPayload(raw);
  } catch {
    return [];
  }
}
