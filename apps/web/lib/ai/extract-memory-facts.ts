import { openrouter } from './client';
import { dedupeExtractedFacts } from './memory-fact-dedupe';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from './rag-config';
import type { MemoryVectorCategory } from './upstash-vector-rest';

export type ExtractedMemoryFact = {
  category: MemoryVectorCategory;
  text: string;
};

export type MemoryExtractionResult = {
  facts: ExtractedMemoryFact[];
  raw_model_text: string;
};

function tryParseJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  return JSON.parse(body) as unknown;
}

/**
 * מחלץ עובדות מובנות מהודעת משתמש (שפה טבעית) — מתעלם מ-small talk.
 */
export async function extractMemoryFactsFromUserMessage(userMessage: string): Promise<MemoryExtractionResult> {
  const msg = userMessage.replace(/\s+/g, ' ').trim();
  if (msg.length < 6) {
    return { facts: [], raw_model_text: '' };
  }

  const system = `אתה מנוע חילוץ עובדות לליווי בריאות, הרגלים וירידה במשקל (NuraWell).
החזר JSON בלבד, בלי markdown, בלי טקסט לפני/אחרי.
סכימה:
{
  "facts": [
    { "category": "strength" | "weakness" | "success" | "failure" | "schedule", "text": "מחרוזת קצרה בעברית" }
  ]
}

חוקים:
- אם ההודעה היא small talk, ברכה, "היי", "מה נשמע", או בלי מידע סביבתי/התנהגותי — החזר {"facts":[]}.
- אל תשמור מידע לא קשור לליווי (מצב עבודה בטכנולוגיה, באגים ב-Next.js, שוק ציפורים וכו') — facts ריק.
- שמור רק מה שרלוונטי לבריאות, אוכל, תנועה, שינה, לחץ, משקל, הרגלים, התחייבויות, לו"ז אימונים, דפוסי כישלון/הצלחה.
- כל "text": משפט אחד או שניים, לכל היותר ~220 תווים, ניסוח מקוצע ושימושי.
- category:
  - strength: נקודת חוזק / משאב
  - weakness: חולשה / קושי חוזר
  - success: הצלחה / ניצחון / עמידה במטרה
  - failure: כשל / סטייה / נפילה
  - schedule: לו"ז, תזמון, "מתאמן ביום X", "שותה מים בבוקר" וכו'
- אותו עניין — פריט אחד. לא כפל טקסטים.
- אם אין עובדות — {"facts":[]}.`;

  const completion = await openrouter.chat.completions.create({
    model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
    temperature: 0.1,
    max_tokens: 800,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `ההודעה:\n${msg}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  if (!raw.trim()) {
    return { facts: [], raw_model_text: raw };
  }

  let parsed: unknown;
  try {
    parsed = tryParseJsonObject(raw);
  } catch {
    return { facts: [], raw_model_text: raw };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { facts: [], raw_model_text: raw };
  }

  const factsRaw = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(factsRaw)) {
    return { facts: [], raw_model_text: raw };
  }

  const allowed: MemoryVectorCategory[] = ['strength', 'weakness', 'success', 'failure', 'schedule'];
  const facts: ExtractedMemoryFact[] = [];

  for (const item of factsRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const category = row.category;
    const text = row.text;
    if (typeof category !== 'string' || !allowed.includes(category as MemoryVectorCategory)) continue;
    if (typeof text !== 'string') continue;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || clean.length > 600) continue;
    facts.push({ category: category as MemoryVectorCategory, text: clean });
  }

  return { facts: dedupeExtractedFacts(facts), raw_model_text: raw };
}
