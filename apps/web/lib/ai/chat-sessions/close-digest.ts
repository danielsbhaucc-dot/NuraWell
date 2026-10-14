import { openrouter } from '../client';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from '../rag-config';
import type { ExtractedMemoryFact } from '../extract-memory-facts';
import { MEMORY_FACT_CATEGORIES } from '../memory-dossier/types';
import { extractMemoriesFromTranscript, parseFactsPayload } from '../user-memories/extract-from-transcript';
import { formatTranscriptForLlm } from './fetch-transcript';
import { generateChatSessionTitle, sanitizeChatSessionTitle } from './session-title';
import { summarizeChatSession } from './summarize-session';
import type { ChatTranscriptTurn } from './types';

export type CloseDigest = {
  summary: string;
  facts: ExtractedMemoryFact[];
  title: string | null;
  mode: 'skipped' | 'combined' | 'separate';
};

const ilDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

/**
 * Tiny chats (≤2 turns, short user text) carry nothing worth an LLM call: deterministic summary,
 * no facts. A 2-turn chat with a long user message still goes to the model (it may hold a real fact).
 */
export function isTrivialChat(turns: ChatTranscriptTurn[]): boolean {
  const convo = turns.filter((t) => t.role === 'user' || t.role === 'assistant');
  if (convo.length === 0) return true;
  if (convo.length > 2) return false;
  const userChars = convo.filter((t) => t.role === 'user').reduce((n, t) => n + t.content.trim().length, 0);
  return userChars < 80;
}

function trivialDigest(turns: ChatTranscriptTurn[]): CloseDigest {
  const firstUser = turns.find((t) => t.role === 'user')?.content.trim() ?? '';
  return {
    summary: firstUser ? `• [${ilDay()}] שיחה קצרה: ${firstUser.slice(0, 80)}` : 'שיחה קצרה ללא תוכן משמעותי לסיכום.',
    facts: [],
    title: null,
    mode: 'skipped',
  };
}

function clip(transcript: string): string {
  return transcript.length > 12_000 ? `${transcript.slice(0, 4_000)}\n…[קוצץ]…\n${transcript.slice(-8_000)}` : transcript;
}

export function parseCombined(raw: string, needTitle: boolean): Omit<CloseDigest, 'mode'> | null {
  const s = raw.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  let j: { summary?: unknown; facts?: unknown; title?: unknown };
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
  const lines = Array.isArray(j.summary) ? j.summary : typeof j.summary === 'string' ? j.summary.split('\n') : null;
  if (!lines) return null;
  const day = ilDay();
  const summary = lines
    .map((l) => String(l).replace(/^[•\-\s]*(\[[0-9-]+\]\s*)?/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => `• [${day}] ${l}`)
    .join('\n');
  if (!summary) return null;
  const facts = parseFactsPayload(JSON.stringify({ facts: Array.isArray(j.facts) ? j.facts : [] }));
  const title = needTitle && typeof j.title === 'string' ? sanitizeChatSessionTitle(j.title) : null;
  return { summary, facts, title };
}

/** One structured call for summary + memory facts (+ title when missing). Falls back to the old 2–3 calls. */
export async function buildCloseDigest(
  turns: ChatTranscriptTurn[],
  opts: { needTitle: boolean; liveFile?: string | null }
): Promise<CloseDigest> {
  if (isTrivialChat(turns)) return trivialDigest(turns);
  const transcript = formatTranscriptForLlm(turns);
  // Combined call is OFF by default: on 10 real chats it kept less than the separate calls
  // (judge coverage summary 3.7 / facts 3.7 vs 4.5 / 4.1 for a rerun of the old pipeline).
  if (process.env.CLOSE_DIGEST_COMBINED?.trim() === '1') try {
    const completion = await openrouter.chat.completions.create({
      model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
      temperature: 0.15,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `אתה מעבד שיחת ליווי (NuraWell) בין המשתמש לאלמוג (מנטור, לשון זכר) בסגירתה. שתי משימות נפרדות, כל אחת במלואה. החזר JSON בלבד:
{"facts":[{"category":"goal","text":"…","level":2}],"summary":["…"]${opts.needTitle ? ',"title":"…"' : ''}}

משימה 1 — facts (מנוע חילוץ זיכרונות לטווח ארוך): קרא את התמליל המלא. רמות: 2=דפוס חוזר, 3=תובנה, 4=שבירה. רק level 2–4.
קטגוריות: ${MEMORY_FACT_CATEGORIES.join(' | ')}.
שמור כל עובדה, יעד בריאות, העדפה, חסם וטריגר שרלוונטיים לשיחות עתידיות — אל תוותר על עובדות כדי לקצר. כל text: משפט אחד עד ~220 תווים בעברית. אם אין מה לשמור — [].

משימה 2 — summary: 2–6 נקודות קצרות בעברית לזיכרון רזה. רק דברים שכדאי לזכור: עובדות חדשות על המשתמש, שינוי במצב (למשל "הפסיק לרוץ"), קושי מרכזי, הסכמה/משימה שקיבל, רגש בולט. בלי תיאור של מה אלמוג אמר, בלי "הצעד הבא" כללי, בלי חזרות. רק מה שנאמר בתמליל, בלי הסקות. שיחה בלי תוכן → נקודה אחת.${
            opts.needTitle ? '\nמשימה 3 — title: כותרת קצרה לשיחה, 2–5 מילים בעברית, בלי מרכאות ובלי אימוג׳י.' : ''
          }`,
        },
        { role: 'user', content: `תמליל השיחה:\n\n${clip(transcript)}` },
      ],
    });
    const parsed = parseCombined(completion.choices[0]?.message?.content ?? '', opts.needTitle);
    if (parsed) return { ...parsed, mode: 'combined' };
  } catch {
    /* fall through to the proven separate calls */
  }
  const [summary, facts] = await Promise.all([summarizeChatSession(turns), extractMemoriesFromTranscript(transcript)]);
  const firstUser = turns.find((t) => t.role === 'user')?.content ?? '';
  const title = opts.needTitle ? await generateChatSessionTitle({ userMessage: firstUser, liveFile: opts.liveFile }) : null;
  return { summary, facts, title, mode: 'separate' };
}
