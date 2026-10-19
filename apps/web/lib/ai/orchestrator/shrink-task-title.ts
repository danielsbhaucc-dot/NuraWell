/**
 * 🤏 Deterministic "smaller version" of a concrete task title (fallback when the LLM is unavailable).
 * Shrinks the task's own measurable part (count / minutes) instead of a generic "tiny version of X".
 *   "שתיה של 2 כוסות מים לפני צהריים" → "שתיה של כוס מים אחת לפני צהריים"
 *   "הליכה של 20 דקות"               → "הליכה של 10 דקות"
 * Returns null when nothing measurable can be shrunk (caller then uses a "just start" phrasing).
 */

/** plural → [singular, feminine?] for "one X" phrasing. */
const UNITS: Record<string, [string, boolean]> = {
  כוסות: ['כוס', true],
  דקות: ['דקה', true],
  פעמים: ['פעם', true],
  ארוחות: ['ארוחה', true],
  מנות: ['מנה', true],
  שעות: ['שעה', true],
  פירות: ['פרי', false],
  ירקות: ['ירק', false],
  בקבוקים: ['בקבוק', false],
  צעדים: ['צעד', false],
  עמודים: ['עמוד', false],
  שיעורים: ['שיעור', false],
  ימים: ['יום', false],
};

/** Nouns that belong to the unit ("כוסות מים"); anything else ("ביום", "לפני") stays outside. */
const UNIT_NOUNS = new Set(['מים', 'תה', 'קפה', 'ירקות', 'פירות', 'חלבון', 'סלט', 'מרק']);

const MINUTE_UNITS = new Set(['דקות', 'שעות']);

export function shrinkTaskTitle(title: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s+([\u0590-\u05FF"׳״]+)(?:\s+([\u0590-\u05FF]+))?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 1) return null;
  const unit = m[2]!;
  const noun = m[3] && UNIT_NOUNS.has(m[3]) ? m[3] : undefined;
  let half = MINUTE_UNITS.has(unit) && n >= 4 ? Math.round(n / 2) : Math.floor(n / 2);
  if (half < 1) half = 1;
  const start = m.index!;
  const before = t.slice(0, start);
  const consumed = noun ? m[0].length : m[0].length - (m[3] ? m[3].length + 1 : 0);
  const after = t.slice(start + consumed);
  if (half === 1 && UNITS[unit]) {
    const [sing, fem] = UNITS[unit];
    const one = fem ? 'אחת' : 'אחד';
    // "2 כוסות מים" → "כוס מים אחת"; "2 פירות" → "פרי אחד"
    const phrase = noun ? `${sing} ${noun} ${one}` : `${sing} ${one}`;
    return `${before}${phrase}${after}`.replace(/\s+/g, ' ').trim();
  }
  return `${before}${half} ${unit}${noun ? ` ${noun}` : ''}${after}`.replace(/\s+/g, ' ').trim();
}

/** Natural tiny-step title for any task (never "גרסה זעירה של ..."). */
export function tinyStepTitle(title: string): string {
  const shrunk = shrinkTaskTitle(title);
  if (shrunk && shrunk !== title.trim()) return shrunk;
  const t = title.replace(/\s+/g, ' ').trim();
  return `רק להתחיל: ${t} — 2 דקות, וזה נחשב`;
}
