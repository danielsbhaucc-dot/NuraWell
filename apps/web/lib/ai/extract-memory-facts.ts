import { openrouter } from './client';
import { dedupeExtractedFacts } from './memory-fact-dedupe';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from './rag-config';
import type { MemoryVectorCategory } from './upstash-vector-rest';

/** רמת שמירה ל-Upstash — רק 2+ נכנסות לאינדקס */
export type MemoryInsightLevel = 2 | 3 | 4;

export type ExtractedMemoryFact = {
  category: MemoryVectorCategory;
  text: string;
  level: MemoryInsightLevel;
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
    const levelRaw = row.level;
    if (typeof category !== 'string' || !allowed.includes(category as MemoryVectorCategory)) continue;
    if (typeof text !== 'string') continue;
    const lv =
      typeof levelRaw === 'number' && [2, 3, 4].includes(levelRaw)
        ? (levelRaw as MemoryInsightLevel)
        : typeof levelRaw === 'string' && /^[234]$/.test(levelRaw.trim())
          ? (Number(levelRaw.trim()) as MemoryInsightLevel)
          : null;
    if (lv === null || lv < 2) continue;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || clean.length > 600) continue;
    facts.push({ category: category as MemoryVectorCategory, text: clean, level: lv });
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
  const system = `אתה מנוע חילוץ תובנות לליווי בריאות והרגלים (NuraWell) — לא לאגור עובדות טריוויאליות.

פורמט פלט — חובה מוחלטת:
- החזר אובייקט JSON יחיד ותקין בלבד.
- בלי markdown: אסור להשתמש ב-\`\`\` או ב-json או בכותרות.
- אסור טקסט לפני הסוגר הראשון או אחרי הסוגר האחרון.
- השדה היחיד הוא "facts" — מערך של אובייקטים, או מערך ריק.

רמות (חובה לכל פריט):
- level 1 — עובדה חד-פעמית ("אכלתי פיצה", "אוהב פסטה") → אל תשלח בכלל (אסור להכליל facts ברמה 1).
- level 2 — pattern חוזר / טריגר מוכח ("נופל בסופ\"ש באכילה", "ערבים אחרי יום עבודה").
- level 3 — insight שמשנה גישה ("הקושי קשור לבדידות לא לרעב").
- level 4 — breakthrough ("הבין ש-X גורם ל-Y וזה משנה את המשמעות").

כל פריט חייב: "category", "text", "level" (מספר 2–4 בלבד).

דוגמה תקינה:
{"facts":[{"category":"weakness","level":2,"text":"דפוס חוזר של פיצוח בערב אחרי ימים עמוסים"}]}

דוגמה כשאין מה לשמור:
{"facts":[]}

סכימת כל פריט:
{ "category": "strength" | "weakness" | "success" | "failure" | "schedule", "text": "מחרוזת קצרה בעברית", "level": 2 | 3 | 4 }

חוקי תוכן (קפדניים):
- אם אין דפוס חוזר, טריגר רגשי משמעותי, או תובנה שתשנה את גישת המנטור — החזר {"facts":[]}.
- אם ההודעה היא small talk, ברכה, "היי", "מה נשמע", או רק עובדות חד-פעמיות לא משמעותיות — {"facts":[]}.
- אל תשמור מידע לא קשור לליווי — {"facts":[]}.
- כל "text": משפט אחד או שניים, עד ~220 תווים.
- אותו עניין — פריט אחד.

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
