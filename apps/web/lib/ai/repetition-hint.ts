/**
 * Detects the user repeating a request/theme across turns and sessions (lexical, no LLM, no embeddings) and
 * returns ONE short hint line for the writer, or null. Cost: ~1 line of prompt only when it fires.
 */
export type PastUserMessage = { content: string; createdAt: string; sessionId?: string | null };

const STOP = new Set(['אני', 'אתה', 'את', 'לי', 'לך', 'של', 'על', 'עם', 'זה', 'מה', 'גם', 'רק', 'לא', 'כן', 'אבל', 'או', 'אם', 'כי', 'יש', 'אין', 'היי', 'אלמוג', 'בבקשה', 'קדימה', 'תודה', 'עוד', 'כבר', 'סתם', 'ממש']);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    // light Hebrew normalization: drop common one-letter prefixes (ו/ה/ב/ל/ש/מ/כ) on longer words
    const w = raw.length > 3 ? raw.replace(/^[והבלשמכ]/, '') : raw;
    if (w.length >= 2 && !STOP.has(w) && !STOP.has(raw)) out.add(w);
  }
  return out;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  let strong = false;
  for (const t of a)
    if (b.has(t)) {
      inter += 1;
      if (t.length >= 4) strong = true;
    }
  // short messages ("תשלח לי תפריט") share one key word; require it to be a real content word
  return strong ? inter / Math.min(a.size, b.size) : 0;
}

export function buildRepetitionHint(
  current: string,
  past: PastUserMessage[],
  opts: { sessionId?: string | null; now?: number } = {}
): string | null {
  const cur = tokens(current);
  if (cur.size === 0) return null;
  let inSession = 0;
  let otherSessions = 0;
  let lastOther: string | null = null;
  for (const m of past) {
    if (m.content.trim() === current.trim() || similarity(cur, tokens(m.content)) >= 0.5) {
      if (opts.sessionId && m.sessionId === opts.sessionId) inSession += 1;
      else {
        otherSessions += 1;
        if (!lastOther || m.createdAt > lastOther) lastOther = m.createdAt;
      }
    }
  }
  if (inSession < 2 && otherSessions < 2) return null;
  const parts: string[] = [];
  if (inSession >= 1) parts.push(`${inSession + 1} פעמים בשיחה הזו`);
  if (otherSessions >= 1) {
    const days = lastOther ? Math.max(0, Math.round(((opts.now ?? Date.now()) - new Date(lastOther).getTime()) / 86400000)) : null;
    parts.push(`${otherSessions} פעמים בשיחות קודמות${days !== null ? ` (לאחרונה לפני ${days === 0 ? 'פחות מיום' : `${days} ימים`})` : ''}`);
  }
  return `[חזרה] המשתמש כותב בקשה/נושא דומה: ${parts.join(', ')}. מותר לשקף את זה בעדינות ובחום (מה עומד מאחורי החזרה?), בלי להאשים ובלי לצטט רשימות.`;
}
