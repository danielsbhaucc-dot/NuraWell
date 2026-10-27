/**
 * "התוכנית שלך" as a written plan — pure view-model (no I/O, no AI): built on the server from the real plan
 * (ladder levels, level-change events with source + reason) so every line reflects what Almog actually changed.
 */
import type { PlanTask } from '@/lib/module-api/journey/lib-tasks';
import { STEP_UP_AFTER_SUCCESS_DAYS, resolveLadder } from '@/lib/module-api/journey/lib-tasks-ladder';

export type Gender = 'female' | 'male' | 'other';
export type PlanChangeNote = { at: string; text: string; quote: string | null; direction: 'down' | 'up' | 'start' };
export type PlanHabit = {
  id: string;
  emoji: string;
  habitTitle: string; // the full (original) habit from the lesson
  currentStep: string;
  nextStep: string | null;
  fallbackStep: string | null;
  status: 'original' | 'eased' | 'stretched';
  statusLabel: string;
  progressNote: string;
  doneToday: number;
  targetToday: number;
  streakDays: number;
  ladder: { level: number; current: boolean; reached: boolean }[];
  latestNote: PlanChangeNote | null;
  isMain: boolean;
};

const fmtDate = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' });
export const formatPlanDate = (iso: string) => fmtDate.format(new Date(iso));

const g = (gender: Gender, f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);

/** User's own words are shown as a quote; system/test reasons are not. */
function userQuote(reason: string | null, source: string | null | undefined): string | null {
  const r = (reason ?? '').trim();
  if (!r || source === 'almog_auto' || source === 'admin') return null;
  if (/^(המשתמש ביקש|e2e|test)/i.test(r)) return null;
  return r.length > 110 ? `${r.slice(0, 108).trimEnd()}…` : r;
}

/** One level-change event → a sentence in Almog's voice (first person, gender-aware, no slash forms). */
export function almogChangeNote(
  h: { kind: string; from_level: number | null; to_level: number | null; reason: string | null; occurred_at: string; source?: string | null },
  gender: Gender
): PlanChangeNote {
  if (h.kind === 'accepted') {
    return { at: h.occurred_at, direction: 'start', quote: null, text: g(gender, 'בחרת להתחיל את ההרגל הזה, ומאז אני מלווה אותו איתך.', 'בחרת להתחיל את ההרגל הזה, ומאז אני מלווה אותו איתך.', 'ההרגל נכנס לתוכנית, ומאז אני מלווה אותו.') };
  }
  const down = (h.to_level ?? 0) < (h.from_level ?? 0);
  const auto = h.source === 'almog_auto';
  const quote = userQuote(h.reason, h.source);
  let text: string;
  if (down && auto) text = 'ראיתי כמה ימים קשים ברצף, אז הקלתי צעד אחד. צעד קטן שמצליח כל יום שווה יותר מיעד גדול שנתקע.';
  else if (down) text = `${quote ? 'שיתפת אותי שזה קשה' : 'ביקשת הקלה'}, אז הורדתי צעד אחד. זה לא צעד אחורה, זו התאמה חכמה.`;
  else if (auto) text = g(gender, 'הצלחת בעקביות, אז עלינו צעד בחזרה לכיוון ההרגל המלא. את מוכנה לזה.', 'הצלחת בעקביות, אז עלינו צעד בחזרה לכיוון ההרגל המלא. אתה מוכן לזה.', 'ההצלחה הייתה עקבית, אז עלינו צעד בחזרה לכיוון ההרגל המלא.');
  else text = 'אמרת שזה כבר קל, אז העליתי צעד. תמיד אפשר לחזור אחורה.';
  return { at: h.occurred_at, direction: down ? 'down' : 'up', quote, text };
}

export function buildPlanHabit(t: PlanTask, gender: Gender): PlanHabit {
  const all = resolveLadder(t.definition).filter((l) => l.level >= t.definition.floor_level && l.level <= t.definition.max_level);
  const byLevel = new Map(all.map((l) => [l.level, l]));
  const cur = t.current_level;
  const original = byLevel.get(0)?.title ?? t.definition.title;
  const next = byLevel.get(cur + 1);
  const prev = byLevel.get(cur - 1);
  const status: PlanHabit['status'] = cur < 0 ? 'eased' : cur > 0 ? 'stretched' : 'original';
  const left = Math.max(0, STEP_UP_AFTER_SUCCESS_DAYS - t.successDaysAtLevel);
  const progressNote =
    status === 'eased'
      ? left === 0
        ? 'מחר אני בודק אם עולים צעד.'
        : `עוד ${left} ${left === 1 ? 'יום מוצלח' : 'ימים מוצלחים'} ברצף ואעלה צעד לכיוון ההרגל המלא.`
      : status === 'original'
        ? g(gender, 'את בהרגל המלא. עכשיו המטרה היא יציבות.', 'אתה בהרגל המלא. עכשיו המטרה היא יציבות.', 'זה ההרגל המלא. עכשיו המטרה היא יציבות.')
        : 'מעבר להרגל המלא. אם זה מכביד, חוזרים צעד בלי שום בעיה.';
  const latest = t.history.find((h) => h.kind === 'level_change') ?? t.history.find((h) => h.kind === 'accepted') ?? null;
  return {
    id: t.id,
    emoji: t.definition.emoji ?? '🌱',
    habitTitle: original,
    currentStep: t.level.title,
    nextStep: next ? next.title : null,
    fallbackStep: prev ? prev.title : null,
    status,
    statusLabel: status === 'eased' ? 'בגרסה מותאמת' : status === 'stretched' ? 'מעבר ליעד' : 'ההרגל המלא',
    progressNote,
    doneToday: t.doneToday,
    targetToday: t.targetToday,
    streakDays: t.streakDays,
    ladder: all.map((l) => ({ level: l.level, current: l.level === cur, reached: l.level <= cur })),
    latestNote: latest ? almogChangeNote(latest, gender) : null,
    isMain: t.is_main,
  };
}

/** Almog's opening note for the whole plan — composed from the real state, never generic filler. */
export function almogPlanSummary(habits: PlanHabit[], gender: Gender, firstName: string): string {
  const name = firstName ? `${firstName}, ` : '';
  if (!habits.length) return `${name}התוכנית מתחילה מהשיעור הראשון: כל שיעור מציע הרגל אחד קטן, וכשבוחרים אותו אני בונה סביבו את הצעדים.`;
  const eased = habits.filter((h) => h.status === 'eased');
  const full = habits.filter((h) => h.status !== 'eased');
  const parts: string[] = [];
  if (eased.length) parts.push(`כרגע ${eased.length === 1 ? `"${eased[0]!.habitTitle}" בגרסה מותאמת` : `${eased.length} הרגלים בגרסה מותאמת`}, כדי שכל יום ייגמר בהצלחה`);
  if (full.length) parts.push(`${full.length === 1 ? `"${full[0]!.habitTitle}" כבר בגרסה המלאה` : `${full.length} הרגלים כבר בגרסה המלאה`}`);
  const close = g(gender, 'אני עוקב אחרי כל דיווח שלך ומתאים את הצעדים. את לא צריכה להיות מושלמת, רק להמשיך.', 'אני עוקב אחרי כל דיווח שלך ומתאים את הצעדים. אתה לא צריך להיות מושלם, רק להמשיך.', 'אני עוקב אחרי כל דיווח ומתאים את הצעדים. לא צריך להיות מושלמים, רק להמשיך.');
  return `${name}${parts.join(', ו')}. ${close}`;
}

/** Goal line: the product is habit change, so even "weight loss" is framed through habits. */
export function planGoalLine(mainGoal: string | null | undefined): string {
  if (mainGoal === 'weight_loss') return 'משקל טוב יותר, דרך הרגלים שנשארים לאורך זמן';
  if (mainGoal === 'both') return 'אורח חיים בריא ומשקל טוב יותר, צעד אחרי צעד';
  return 'אורח חיים בריא שנבנה מהרגלים קטנים ויציבים';
}
