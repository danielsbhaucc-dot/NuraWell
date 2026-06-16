/**
 * Gating לכלי recall — רק כשיש תוכן משמעותי + רמז לדפוס/מאבק/ניצחון.
 * חוסך טוקנים: לא מזריקים schema כלי בכל הודעה.
 */

const MIN_LETTERS = 28;

const SMALL_TALK =
  /^(?:היי|הי|שלום|תודה|אוקיי|בסדר|מעולה|סבבה|כן|לא|ok|thanks?)[\s!?.\u05F3\u05F4]*$/iu;

/** מאבק, ניצחון, הרגל חוזר — סיבה אמיתית לשלוף היסטוריה. */
const RECALL_WORTHY =
  /(?:מאבק|קשה|לא\s+מצליח|נפל|כישלון|לחץ|חרדה|עייפ|כאב|הצלח|ניצחון|הרגל|שגרה|שוב|חוזר|דפוס|ניסיתי|עברתי|התמד|ויתור|פחד|מתוסכל|עצב|עומס|burnout|stress|habit|struggle|again|pattern)/iu;

export function shouldAttemptMemoryRecall(
  userMessage: string,
  hints?: { emotional?: boolean; blocker?: boolean; heavyContext?: boolean }
): boolean {
  if (process.env.AI_MEMORY_RECALL_TOOLS?.trim() === '0') return false;

  const t = userMessage.replace(/\s+/g, ' ').trim();
  if (!t || SMALL_TALK.test(t)) return false;

  const letters = t.replace(/[^\u0590-\u05FFa-zA-Z]/g, '');
  if (letters.length < MIN_LETTERS) return false;

  if (hints?.blocker || hints?.emotional) {
    return RECALL_WORTHY.test(t);
  }
  if (hints?.heavyContext && RECALL_WORTHY.test(t)) return true;
  if (RECALL_WORTHY.test(t) && letters.length >= 40) return true;

  return false;
}

export function isMemoryRecallToolsEnabled(): boolean {
  return process.env.AI_MEMORY_RECALL_TOOLS?.trim() !== '0';
}
