/**
 * Deterministic detection of an explicit "make my task easier/harder" request in chat.
 * Runs before the model so the action is REAL (not just claimed by the reply).
 * Conservative: an emotional "קשה לי היום" without a task reference does not trigger.
 */
export type LevelIntent = { direction: 'easier' | 'harder'; targetIndex: number } | null;

const EASIER_VERB = /(תוריד|תורידי|להוריד|תקל|תקלי|להקל|תקטין|להקטין|גרסה\s*(?:יותר\s*)?קלה|רמה\s*(?:אחת\s*)?(?:למטה|פחות)|תוריד\s*רמה)/;
const HARDER_VERB = /(תעלה|תעלי|להעלות|להקשות|תקשה|רמה\s*(?:אחת\s*)?(?:למעלה|יותר)|יותר\s*מאתגר)/;
const HARD_FEEL = /(קשה\s*לי|קשה\s*מדי|כבד\s*לי|לא\s*מצליח(?:ה)?\s*לעמוד)/;
const EASY_FEEL = /(קל\s*לי|קל\s*מדי|משעמם\s*לי)/;
const TASK_WORD = /(משימה|משימת|המשימה|תרגיל|הרגל|רמה)/;

function words(t: string) {
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function detectLevelIntent(text: string, taskTitles: string[]): LevelIntent {
  const t = text.trim();
  if (!t || !taskTitles.length) return null;
  const tw = words(t);
  const same = (a: string, b: string) => a === b || `ה${a}` === b || a === `ה${b}`;
  const overlap = taskTitles.map((title) => words(title).filter((w) => tw.some((x) => same(x, w))).length);
  let targetIndex = overlap.indexOf(Math.max(...overlap));
  const mentionsTask = Math.max(...overlap) > 0 || TASK_WORD.test(t);
  if (Math.max(...overlap) === 0) targetIndex = 0; // single/main task
  const easier = EASIER_VERB.test(t) || (HARD_FEEL.test(t) && mentionsTask);
  const harder = HARDER_VERB.test(t) || (EASY_FEEL.test(t) && mentionsTask);
  if (easier === harder) return null;
  if (!mentionsTask && !(EASIER_VERB.test(t) || HARDER_VERB.test(t))) return null;
  if (!mentionsTask) return null; // a bare verb ("תוריד") about something else
  return { direction: easier ? 'easier' : 'harder', targetIndex };
}
