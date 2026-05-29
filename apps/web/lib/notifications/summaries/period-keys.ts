/**
 * Period-key utilities for the Memory Pyramid.
 *
 * הקובץ אחראי *רק* על מתמטיקה של תאריכים: לפענח/לבנות `period_key`,
 * ולחשב את "ילדי" התקופה ברמה אחת מתחת (cascade).
 *
 * פורמטים קנוניים (תואמים את המיגרציה 000028):
 *   daily       → 'YYYY-MM-DD'   (e.g. 2026-05-29)
 *   weekly      → 'YYYY-Www'     (e.g. 2026-W22)   — ISO 8601 week (Mon→Sun)
 *   monthly     → 'YYYY-Mmm'     (e.g. 2026-M05)
 *   quarterly   → 'YYYY-Qq'      (e.g. 2026-Q2)
 *   semi_annual → 'YYYY-Hh'      (e.g. 2026-H1)
 *   annual      → 'YYYY'         (e.g. 2026)
 *
 * כל החישובים ב-UTC כדי להימנע מ-DST. התאריכים שמתקבלים תואמים
 * ללוח Israel ברזולוציית יום (date_key = 'YYYY-MM-DD' בלוח ירושלים),
 * שזו רמת הדיוק של ה-engine.
 */

export type SummaryType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export const SUMMARY_TYPES: readonly SummaryType[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
] as const;

/** מפה מ-type של אב → type של ילד ב-cascade. `daily` הוא העלה. */
export const CHILD_TYPE: Record<SummaryType, SummaryType | null> = {
  daily: null,
  weekly: 'daily',
  monthly: 'weekly',
  quarterly: 'monthly',
  semi_annual: 'quarterly',
  annual: 'semi_annual',
};

// ─── תאריכים בסיסיים ────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Build YYYY-MM-DD from a UTC Date. */
export function toDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Parse 'YYYY-MM-DD' → UTC Date (midnight). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const d = fromDateKey(key);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return toDateKey(d);
}

/** אנגלית מלאה: Sunday..Saturday. שימושי ל-weakest_day. */
export const DOW_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type DayOfWeek = (typeof DOW_NAMES)[number];

export function dayOfWeek(dateKey: string): DayOfWeek {
  return DOW_NAMES[fromDateKey(dateKey).getUTCDay()];
}

// ─── ISO week ───────────────────────────────────────────────────

/**
 * ISO 8601 week — שבוע מתחיל ביום שני, שבוע 1 הוא השבוע שמכיל את 4/1.
 * מחזיר { year, week } *של המפתח השבועי*. שימו לב: שלושת הימים
 * הראשונים של השנה יכולים להיות שייכים לשבוע 52/53 של השנה הקודמת.
 */
export function isoWeekOf(date: Date): { year: number; week: number } {
  // Algorithm from https://en.wikipedia.org/wiki/ISO_week_date
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // עוברים לחמישי של אותו שבוע
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** התחלת שבוע ISO (יום שני) ב-UTC עבור (year, week). */
export function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const start = new Date(week1Mon);
  start.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  return start;
}

/** מחזיר את 7 הימים (date_keys) של שבוע ISO, שני→ראשון. */
export function isoWeekDateKeys(year: number, week: number): string[] {
  const start = isoWeekStart(year, week);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return toDateKey(d);
  });
}

// ─── עיצוב period_key + פירוק ───────────────────────────────────

const RX_DAILY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RX_WEEKLY = /^(\d{4})-W(\d{2})$/;
const RX_MONTHLY = /^(\d{4})-M(\d{2})$/;
const RX_QUARTERLY = /^(\d{4})-Q([1-4])$/;
const RX_SEMI = /^(\d{4})-H([12])$/;
const RX_ANNUAL = /^(\d{4})$/;

export interface ParsedPeriod {
  type: SummaryType;
  /** טווח תאריכים (כולל) בלוח 'YYYY-MM-DD'. */
  startDate: string;
  endDate: string;
}

/** מחלק `period_key` → range של dates. זורק אם הפורמט לא תקין. */
export function parsePeriodKey(type: SummaryType, key: string): ParsedPeriod {
  switch (type) {
    case 'daily': {
      const m = key.match(RX_DAILY);
      if (!m) throw new Error(`Invalid daily period_key: ${key}`);
      return { type, startDate: key, endDate: key };
    }
    case 'weekly': {
      const m = key.match(RX_WEEKLY);
      if (!m) throw new Error(`Invalid weekly period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const week = Number.parseInt(m[2], 10);
      const days = isoWeekDateKeys(year, week);
      return { type, startDate: days[0], endDate: days[6] };
    }
    case 'monthly': {
      const m = key.match(RX_MONTHLY);
      if (!m) throw new Error(`Invalid monthly period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const month = Number.parseInt(m[2], 10);
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0)); // האחרון בחודש
      return { type, startDate: toDateKey(start), endDate: toDateKey(end) };
    }
    case 'quarterly': {
      const m = key.match(RX_QUARTERLY);
      if (!m) throw new Error(`Invalid quarterly period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const q = Number.parseInt(m[2], 10);
      const startMonth = (q - 1) * 3;
      const start = new Date(Date.UTC(year, startMonth, 1));
      const end = new Date(Date.UTC(year, startMonth + 3, 0));
      return { type, startDate: toDateKey(start), endDate: toDateKey(end) };
    }
    case 'semi_annual': {
      const m = key.match(RX_SEMI);
      if (!m) throw new Error(`Invalid semi_annual period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const h = Number.parseInt(m[2], 10);
      const startMonth = h === 1 ? 0 : 6;
      const start = new Date(Date.UTC(year, startMonth, 1));
      const end = new Date(Date.UTC(year, startMonth + 6, 0));
      return { type, startDate: toDateKey(start), endDate: toDateKey(end) };
    }
    case 'annual': {
      const m = key.match(RX_ANNUAL);
      if (!m) throw new Error(`Invalid annual period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      return {
        type,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      };
    }
  }
}

// ─── ילדי תקופה (cascade) ───────────────────────────────────────

/**
 * מחזיר את ה-`period_key`s של רמת הילד (CHILD_TYPE[type]) לתקופה הזאת.
 *
 * דוגמאות:
 *   getChildPeriodKeys('weekly',     '2026-W22')    → ['2026-05-25', ..., '2026-05-31']
 *   getChildPeriodKeys('monthly',    '2026-M05')    → ['2026-W18', '2026-W19', ..., '2026-W22']
 *   getChildPeriodKeys('quarterly',  '2026-Q2')     → ['2026-M04', '2026-M05', '2026-M06']
 *   getChildPeriodKeys('semi_annual','2026-H1')     → ['2026-Q1', '2026-Q2']
 *   getChildPeriodKeys('annual',     '2026')        → ['2026-H1', '2026-H2']
 *
 * `daily` לא מחזיר ילדים (זה העלה — נקרא ישירות מ-task_logs).
 */
export function getChildPeriodKeys(type: SummaryType, key: string): string[] {
  switch (type) {
    case 'daily':
      return [];
    case 'weekly': {
      const m = key.match(RX_WEEKLY);
      if (!m) throw new Error(`Invalid weekly period_key: ${key}`);
      return isoWeekDateKeys(Number.parseInt(m[1], 10), Number.parseInt(m[2], 10));
    }
    case 'monthly': {
      const m = key.match(RX_MONTHLY);
      if (!m) throw new Error(`Invalid monthly period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const month = Number.parseInt(m[2], 10);
      // ISO weeks שיש להן חפיפה כלשהי עם החודש.
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0));
      const seen = new Set<string>();
      const out: string[] = [];
      for (
        let d = new Date(monthStart);
        d.getTime() <= monthEnd.getTime();
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const { year: wy, week: ww } = isoWeekOf(d);
        const k = `${wy}-W${pad2(ww)}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
      return out;
    }
    case 'quarterly': {
      const m = key.match(RX_QUARTERLY);
      if (!m) throw new Error(`Invalid quarterly period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const q = Number.parseInt(m[2], 10);
      const startMonth = (q - 1) * 3 + 1;
      return [0, 1, 2].map((i) => `${year}-M${pad2(startMonth + i)}`);
    }
    case 'semi_annual': {
      const m = key.match(RX_SEMI);
      if (!m) throw new Error(`Invalid semi_annual period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      const h = Number.parseInt(m[2], 10);
      return h === 1 ? [`${year}-Q1`, `${year}-Q2`] : [`${year}-Q3`, `${year}-Q4`];
    }
    case 'annual': {
      const m = key.match(RX_ANNUAL);
      if (!m) throw new Error(`Invalid annual period_key: ${key}`);
      const year = Number.parseInt(m[1], 10);
      return [`${year}-H1`, `${year}-H2`];
    }
  }
}

// ─── builders למפתחות ──────────────────────────────────────────

export function buildDailyKey(d: Date): string {
  return toDateKey(d);
}
export function buildWeeklyKey(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${pad2(week)}`;
}
export function buildMonthlyKey(d: Date): string {
  return `${d.getUTCFullYear()}-M${pad2(d.getUTCMonth() + 1)}`;
}
export function buildQuarterlyKey(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}
export function buildSemiAnnualKey(d: Date): string {
  const h = d.getUTCMonth() < 6 ? 1 : 2;
  return `${d.getUTCFullYear()}-H${h}`;
}
export function buildAnnualKey(d: Date): string {
  return `${d.getUTCFullYear()}`;
}

export function buildPeriodKey(type: SummaryType, d: Date): string {
  switch (type) {
    case 'daily':
      return buildDailyKey(d);
    case 'weekly':
      return buildWeeklyKey(d);
    case 'monthly':
      return buildMonthlyKey(d);
    case 'quarterly':
      return buildQuarterlyKey(d);
    case 'semi_annual':
      return buildSemiAnnualKey(d);
    case 'annual':
      return buildAnnualKey(d);
  }
}

/** Validate that `key` matches the expected format for `type`. */
export function isValidPeriodKey(type: SummaryType, key: string): boolean {
  try {
    parsePeriodKey(type, key);
    return true;
  } catch {
    return false;
  }
}
