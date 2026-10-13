/**
 * ALMOG_PROMPT_V2 per-turn budgets. Pure functions (tested).
 *  • History: last N messages in full; older context comes from the session live file (incremental rolling
 *    summary, updated after each turn by a cheap model), so the window can be short. Long messages are capped,
 *    newest first, within a total char budget.
 *  • Context sections: protected sections (safety, real actions, notification, plan, time) are never cut;
 *    other long sections are trimmed to a per-section cap, and the lowest-priority ones are dropped last-first
 *    when the total is over budget.
 */
export const V2_HISTORY_MESSAGES = 12;
export const V2_HISTORY_BUDGET_CHARS = 9000;
export const V2_MESSAGE_CAP_CHARS = 1500;
export const V2_CONTEXT_BUDGET_CHARS = 11000;
export const V2_SECTION_CAP_CHARS = 2200;

export function budgetHistoryV2<T extends { role: string; content: string }>(msgs: T[]): T[] {
  const tail = msgs.slice(-V2_HISTORY_MESSAGES);
  const out: T[] = [];
  let used = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const m = tail[i]!;
    const isLast = i === tail.length - 1;
    const content = !isLast && m.content.length > V2_MESSAGE_CAP_CHARS ? `${m.content.slice(0, V2_MESSAGE_CAP_CHARS)}…` : m.content;
    if (!isLast && used + content.length > V2_HISTORY_BUDGET_CHARS) break;
    used += content.length;
    out.unshift({ ...m, content });
  }
  // keep alternation sane: never start with an assistant turn
  while (out.length > 1 && out[0]!.role === 'assistant') out.shift();
  return out;
}

const PROTECTED = [/^\[בטיחות/, /\[פעולה שבוצעה/, /\[לא בוצע שינוי רמה\]/, /^כלל: אל תטען/, /\[מענה להתראה\]/, /^\[התוכנית של המשתמש/, /שעה עכשיו|השעה בישראל|\[זמן/, /^\[כרטיסים בצ׳אט/];
/** lower = dropped first when over budget */
const LOW_PRIORITY = [/זיכרון ארוך|\[RAG|רמזי זיכרון/, /שיחות קודמות|cross-session|סיכומי שיחות/, /שיעורים קרובים/, /דו"ח התקדמות|התקדמות מלא/, /\[מדריכים|מדריך/, /אסטרטגיית מנטור|mentor/i];

export function budgetContextSectionsV2(sections: string[]): { sections: string[]; before: number; after: number; trimmed: number; dropped: number } {
  const before = sections.reduce((n, s) => n + s.length, 0);
  let trimmed = 0;
  let dropped = 0;
  const isProtected = (s: string) => PROTECTED.some((re) => re.test(s.trim()));
  let out = sections.map((s) => {
    if (isProtected(s) || s.length <= V2_SECTION_CAP_CHARS) return s;
    trimmed += 1;
    return `${s.slice(0, V2_SECTION_CAP_CHARS)}…`;
  });
  let total = out.reduce((n, s) => n + s.length, 0);
  for (const re of LOW_PRIORITY) {
    if (total <= V2_CONTEXT_BUDGET_CHARS) break;
    out = out.filter((s) => {
      if (total <= V2_CONTEXT_BUDGET_CHARS || isProtected(s) || !re.test(s)) return true;
      total -= s.length;
      dropped += 1;
      return false;
    });
  }
  return { sections: out, before, after: total, trimmed, dropped };
}

/** names+sizes only (no content) for measuring per-turn context in logs */
export function sectionSizes(sections: string[]): Array<[string, number]> {
  return sections.map((s) => [s.trim().slice(0, 28).replace(/\s+/g, ' '), s.length]);
}
