/**
 * Behaviour-pattern detection — pure, deterministic part of the nightly insights batch.
 *
 * Input: dated events from the last N days (task done/missed, SOS presses, user chat messages).
 * Output: candidate patterns with evidence dates (weekday + time-of-day concentration). The cheap
 * LLM step only *phrases* and *confirms* these, and reads food/mood themes from the chat digest —
 * it never invents a pattern without dated evidence.
 */

export type Daypart = 'morning' | 'midday' | 'evening' | 'night';

export type BehaviourEvent = {
  /** ISO timestamp */
  at: string;
  kind: 'done' | 'missed' | 'sos' | 'chat';
  label?: string | null;
};

export type PatternCandidate = {
  key: string;
  kind: 'hard_weekday' | 'hard_daypart' | 'strong_weekday' | 'weekend_dip';
  weekday?: number; // 0=Sunday … 6=Saturday (Israel)
  daypart?: Daypart;
  /** Israel date keys (YYYY-MM-DD) of the supporting events */
  evidenceDates: string[];
  /** share of the relevant events that fall into this slot (0..1) */
  share: number;
  summaryHe: string;
};

export const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
const DAYPART_HE: Record<Daypart, string> = { morning: 'בבוקר', midday: 'בצהריים', evening: 'בערב', night: 'בלילה' };

export function israelParts(iso: string): { dateKey: string; weekday: number; hour: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, weekday: wd, hour: Number(get('hour')) % 24 };
}

export function daypartOf(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'night';
}

const MIN_EVENTS = 3; // at least 3 struggle events in the slot
const MIN_DISTINCT_DAYS = 2; // …on at least 2 different dates (one bad day is not a pattern)
const MIN_SHARE = 0.4; // and the slot holds ≥40% of all struggle events

/** Struggle = SOS press or missed task. Strength = done task. */
export function detectPatternCandidates(events: BehaviourEvent[]): PatternCandidate[] {
  const struggle = events.filter((e) => e.kind === 'sos' || e.kind === 'missed').map((e) => ({ ...e, ...israelParts(e.at) }));
  const done = events.filter((e) => e.kind === 'done').map((e) => ({ ...e, ...israelParts(e.at) }));
  const out: PatternCandidate[] = [];

  const slot = <T extends { dateKey: string }>(rows: T[], total: number, mk: (dates: string[], share: number) => PatternCandidate | null) => {
    const dates = [...new Set(rows.map((r) => r.dateKey))].sort();
    const share = total > 0 ? rows.length / total : 0;
    if (rows.length >= MIN_EVENTS && dates.length >= MIN_DISTINCT_DAYS && share >= MIN_SHARE) {
      const c = mk(dates, share);
      if (c) out.push(c);
    }
  };

  // hard weekday (e.g. Saturdays)
  for (let wd = 0; wd < 7; wd += 1) {
    const rows = struggle.filter((r) => r.weekday === wd);
    slot(rows, struggle.length, (dates, share) => ({
      key: `hard_weekday_${wd}`,
      kind: 'hard_weekday',
      weekday: wd,
      evidenceDates: dates,
      share,
      summaryHe: `ימי ${HEBREW_WEEKDAYS[wd]} קשים יותר: ${rows.length} רגעים קשים/משימות שהתפספסו ב-${dates.length} ימי ${HEBREW_WEEKDAYS[wd]} שונים`,
    }));
  }

  // weekend (Fri+Sat) dip — only if no single weekday already covers it
  const weekend = struggle.filter((r) => r.weekday === 5 || r.weekday === 6);
  if (!out.some((c) => c.weekday === 5 || c.weekday === 6)) {
    slot(weekend, struggle.length, (dates, share) => ({
      key: 'weekend_dip',
      kind: 'weekend_dip',
      evidenceDates: dates,
      share,
      summaryHe: `סופי שבוע קשים יותר: ${weekend.length} רגעים קשים/פספוסים בשישי-שבת`,
    }));
  }

  // hard time of day (e.g. evenings)
  for (const dp of ['morning', 'midday', 'evening', 'night'] as Daypart[]) {
    const rows = struggle.filter((r) => daypartOf(r.hour) === dp);
    slot(rows, struggle.length, (dates, share) => ({
      key: `hard_daypart_${dp}`,
      kind: 'hard_daypart',
      daypart: dp,
      evidenceDates: dates,
      share,
      summaryHe: `${DAYPART_HE[dp]} זה הזמן הקשה: ${rows.length} רגעים קשים/פספוסים ${DAYPART_HE[dp]} ב-${dates.length} ימים שונים`,
    }));
  }

  // strongest weekday (a success pattern worth reflecting back)
  for (let wd = 0; wd < 7; wd += 1) {
    const rows = done.filter((r) => r.weekday === wd);
    const dates = [...new Set(rows.map((r) => r.dateKey))];
    if (rows.length >= 4 && dates.length >= 2 && done.length > 0 && rows.length / done.length >= 0.35) {
      out.push({
        key: `strong_weekday_${wd}`,
        kind: 'strong_weekday',
        weekday: wd,
        evidenceDates: dates.sort(),
        share: rows.length / done.length,
        summaryHe: `ימי ${HEBREW_WEEKDAYS[wd]} הם הימים החזקים: ${rows.length} משימות שבוצעו ב-${dates.length} ימי ${HEBREW_WEEKDAYS[wd]}`,
      });
    }
  }

  return out.sort((a, b) => b.share - a.share).slice(0, 4);
}

/** Days until the next occurrence of `weekday` in Israel time (0 = today). */
export function daysUntilWeekday(weekday: number, now = new Date()): number {
  const today = israelParts(now.toISOString()).weekday;
  return (weekday - today + 7) % 7;
}
