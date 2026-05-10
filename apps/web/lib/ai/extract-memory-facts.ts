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

/** תוכן בין גדרות markdown ```json ... ``` */
function stripMarkdownFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

/**
 * מחלץ מחרוזת JSON אובייקט: מהסוגר המסולסל הראשון ועד האחרון (לפי בקשה).
 * לא מטפל ב-} בתוך מחרוזות — אם JSON.parse נכשל, המפלים הבאים ינסו.
 */
function extractObjectByOutermostBraces(text: string): string | null {
  const t = text.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

/**
 * תבניות כמו facts: [...] בלי מסגרת מלאה — עוטף ל-{ "facts": [...] }
 */
function tryWrapFactsKeyValue(text: string): string | null {
  const t = text.trim();
  const m = t.match(/facts\s*:\s*(\[[\s\S]*\])/i);
  if (m) return `{"facts":${m[1]}}`;
  return null;
}

/** המודל החזיר רק מערך של פריטים */
function tryWrapBareFactsArray(text: string): string | null {
  const t = text.trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const inner = t.slice(start, end + 1).trim();
  if (!inner.startsWith('[')) return null;
  return `{"facts":${inner}}`;
}

/**
 * ניסיונות פרסור ברורים — ללא זריקת חריג; מחזיר null אם כל הניסיונות נכשלו.
 */
function parseModelJsonPayload(raw: string): unknown | null {
  const stripped = stripMarkdownFences(raw);

  /** קודם facts: [...] בלי אובייקט חיצוני — לפני slice של {…} שעלול לתפוס רק אובייקט פריט */
  const attempts: Array<string | null> = [
    tryWrapFactsKeyValue(stripped),
    extractObjectByOutermostBraces(stripped),
    tryWrapBareFactsArray(stripped),
    stripped.length > 0 ? stripped : null,
  ];

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      /* ניסיון הבא */
    }
  }

  return null;
}

function normalizeFactsFromParsed(parsed: unknown): ExtractedMemoryFact[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const factsRaw = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(factsRaw)) {
    return [];
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

  return dedupeExtractedFacts(facts);
}

/**
 * מחלץ עובדות מובנות מהודעת משתמש (שפה טבעית) — מתעלם מ-small talk.
 */
export async function extractMemoryFactsFromUserMessage(userMessage: string): Promise<MemoryExtractionResult> {
  const msg = userMessage.replace(/\s+/g, ' ').trim();
  if (msg.length < 6) {
    return { facts: [], raw_model_text: '' };
  }

  try {
    return await extractMemoryFactsFromUserMessageInner(msg);
  } catch {
    return { facts: [], raw_model_text: '' };
  }
}

async function extractMemoryFactsFromUserMessageInner(msg: string): Promise<MemoryExtractionResult> {
  const system = `אתה מנוע חילוץ עובדות לליווי בריאות, הרגלים וירידה במשקל (NuraWell).

פורמט פלט — חובה מוחלטת:
- החזר אובייקט JSON יחיד ותקין בלבד.
- בלי markdown: אסור להשתמש ב-\`\`\` או ב-json או בכותרות.
- אסור טקסט לפני הסוגר הראשון או אחרי הסוגר האחרון.
- האובייקט חייב להתחיל ב-{ ולהסתיים ב-}.
- השדה היחיד הוא "facts" — מערך של אובייקטים, או מערך ריק.

דוגמה תקינה בלבד (שכפל את המבנה, לא את התוכן):
{"facts":[{"category":"schedule","text":"מתכנן הליכה ביום שני בבוקר"}]}

דוגמה כשאין מה לשמור:
{"facts":[]}

סכימת כל פריט במערך facts:
{ "category": "strength" | "weakness" | "success" | "failure" | "schedule", "text": "מחרוזת קצרה בעברית" }

חוקי תוכן:
- אם ההודעה היא small talk, ברכה, "היי", "מה נשמע", או בלי מידע סביבתי/התנהגותי — החזר {"facts":[]}.
- אל תשמור מידע לא קשור לליווי (עבודה בטכנולוגיה, באגים, וכו') — {"facts":[]}.
- שמור רק מה שרלוונטי לבריאות, אוכל, תנועה, שינה, לחץ, משקל, הרגלים, התחייבויות, לו"ז אימונים, דפוסי כישלון/הצלחה.
- כל "text": משפט אחד או שניים, לכל היותר ~220 תווים, ניסוח מקוצע ושימושי.
- category: strength | weakness | success | failure | schedule (כפי שמוגדר למעלה).
- אותו עניין — פריט אחד. לא כפל טקסטים.
- אם אין עובדות — {"facts":[]}.

בדיקה לפני שליחה: המחרוזת שלך חייבת להיות parse-able כ-JSON ללא תיקונים.`;

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

  const parsed = parseModelJsonPayload(raw);

  if (parsed === null) {
    return { facts: [], raw_model_text: raw };
  }

  const facts = normalizeFactsFromParsed(parsed);
  return { facts, raw_model_text: raw };
}
