/**
 * Deterministic notable-change detection ($0, no LLM): deviations from the user's own routine.
 * Input = the same dated events the nightly pattern batch already gathers.
 * Output rows are stored as user_insights "change:<key>" (short TTL) so Almog asks about them
 * (what was different / why / how). A change that repeats is picked up by the existing
 * pattern detector, which promotes it to a "pattern:" row.
 * Risk-first ordering: SOS after quiet > broken streak > unusual success.
 */
import { HEBREW_WEEKDAYS, israelParts, type BehaviourEvent } from './detect';

export type NotableChange = {
  key: string;
  kind: 'sos_after_quiet' | 'streak_broken' | 'unusual_success';
  risk: number; // higher = shown first
  dateKey: string;
  summaryHe: string;
};

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function detectNotableChanges(events: BehaviourEvent[], now = new Date()): NotableChange[] {
  const today = israelParts(now.toISOString()).dateKey;
  const recent = (d: string) => dayDiff(today, d) <= 2;
  const ev = events.map((e) => ({ ...e, ...israelParts(e.at) })).sort((a, b) => a.at.localeCompare(b.at));
  const out: NotableChange[] = [];

  // 1. SOS after ≥14 quiet days
  const sos = ev.filter((e) => e.kind === 'sos');
  const lastSos = sos.at(-1);
  if (lastSos && recent(lastSos.dateKey)) {
    const prev = sos.filter((e) => e.dateKey < lastSos.dateKey).at(-1);
    if (!prev || dayDiff(lastSos.dateKey, prev.dateKey) >= 14) {
      out.push({ key: `sos_after_quiet:${lastSos.dateKey}`, kind: 'sos_after_quiet', risk: 3, dateKey: lastSos.dateKey, summaryHe: `לחיצת SOS ב-${lastSos.dateKey} אחרי תקופה שקטה — לבדוק בעדינות מה קרה.` });
    }
  }

  // 2. streak broken: ≥3 consecutive "done" days, then a recent day with a miss and no done
  const doneDays = [...new Set(ev.filter((e) => e.kind === 'done').map((e) => e.dateKey))].sort();
  const missDays = [...new Set(ev.filter((e) => e.kind === 'missed').map((e) => e.dateKey))].filter((d) => !doneDays.includes(d) && recent(d)).sort();
  const brokenOn = missDays.at(-1);
  if (brokenOn) {
    let streak = 0;
    for (let i = 1; i < 30; i++) {
      const d = new Date(Date.parse(`${brokenOn}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
      if (doneDays.includes(d)) streak += 1;
      else break;
    }
    if (streak >= 3) out.push({ key: `streak_broken:${brokenOn}`, kind: 'streak_broken', risk: 2, dateKey: brokenOn, summaryHe: `רצף של ${streak} ימים נשבר ב-${brokenOn} — לשאול מה היה שונה, בלי שיפוט.` });
  }

  // 3. unusual success: a recent "done" on a weekday that is usually hard (≥2 misses, ≥60% missed)
  for (const d of doneDays.filter(recent)) {
    const wd = israelParts(`${d}T12:00:00Z`).weekday;
    const same = ev.filter((e) => e.weekday === wd && e.dateKey < d && (e.kind === 'done' || e.kind === 'missed'));
    const missed = same.filter((e) => e.kind === 'missed').length;
    if (missed >= 2 && missed / same.length >= 0.6) {
      out.push({ key: `unusual_success:${d}`, kind: 'unusual_success', risk: 1, dateKey: d, summaryHe: `הצלחה ביום ${HEBREW_WEEKDAYS[wd]} (${d}) שבדרך כלל קשה לו — לשאול מה עבד אחרת כדי לשחזר.` });
      break;
    }
  }
  return out.sort((a, b) => b.risk - a.risk);
}

/** Always-on, ≤3 lines, risk first. */
export function formatNotableChangesBlock(rows: Array<{ insight_text: string }>): string {
  const lines = rows.slice(0, 3).map((r) => `- ${r.insight_text.trim().slice(0, 200)}`);
  return lines.length ? `[שינויים בולטים לאחרונה — לשאול עליהם בטבעיות, לא לחקור]\n${lines.join('\n')}` : '';
}
