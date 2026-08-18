/**
 * מפתחות תקופה לסיכומי שיחות — daily..annual + bi_monthly (כל 2 חודשים).
 */

import {
  buildAnnualKey,
  buildDailyKey,
  buildMonthlyKey,
  buildQuarterlyKey,
  buildSemiAnnualKey,
  buildWeeklyKey,
  fromDateKey,
  getChildPeriodKeys as getTaskChildPeriodKeys,
  isoWeekDateKeys,
  parsePeriodKey as parseTaskPeriodKey,
  toDateKey,
  type SummaryType,
} from '../../notifications/summaries/period-keys';

export type ChatSummaryType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'bi_monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export const CHAT_SUMMARY_TYPES: readonly ChatSummaryType[] = [
  'daily',
  'weekly',
  'monthly',
  'bi_monthly',
  'quarterly',
  'semi_annual',
  'annual',
] as const;

/** daily → weekly → monthly → bi_monthly → quarterly → semi_annual → annual */
export const CHAT_CHILD_TYPE: Record<ChatSummaryType, ChatSummaryType | null> = {
  daily: null,
  weekly: 'daily',
  monthly: 'weekly',
  bi_monthly: 'monthly',
  quarterly: 'monthly',
  semi_annual: 'quarterly',
  annual: 'semi_annual',
};

const RX_BI_MONTHLY = /^(\d{4})-B([1-6])$/;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** תאריך YYYY-MM-DD בלוח ישראל */
export function israelDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/** גבולות יום ב-UTC לפי date_key ישראלי (YYYY-MM-DD) */
export function israelDayUtcBounds(dateKey: string): { start: Date; end: Date } {
  const startMs = jerusalemMidnightUtcMs(dateKey);
  return {
    start: new Date(startMs),
    end: new Date(startMs + 86400000 - 1),
  };
}

function jerusalemMidnightUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map((s) => Number.parseInt(s, 10));
  for (let h = -14; h <= 14; h += 1) {
    const t = new Date(Date.UTC(y, m - 1, d, h, 0, 0));
    if (israelDateKey(t) !== dateKey) continue;
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        hour: 'numeric',
        hour12: false,
      }).format(t)
    );
    if (hour === 0) return t.getTime();
  }
  return new Date(`${dateKey}T00:00:00+02:00`).getTime();
}

export function buildBiMonthlyKey(d: Date): string {
  const month = d.getUTCMonth() + 1;
  const b = Math.ceil(month / 2);
  return `${d.getUTCFullYear()}-B${b}`;
}

export function buildChatPeriodKey(type: ChatSummaryType, d: Date): string {
  switch (type) {
    case 'daily':
      return buildDailyKey(d);
    case 'weekly':
      return buildWeeklyKey(d);
    case 'monthly':
      return buildMonthlyKey(d);
    case 'bi_monthly':
      return buildBiMonthlyKey(d);
    case 'quarterly':
      return buildQuarterlyKey(d);
    case 'semi_annual':
      return buildSemiAnnualKey(d);
    case 'annual':
      return buildAnnualKey(d);
  }
}

export function parseChatPeriodKey(
  type: ChatSummaryType,
  key: string
): { startDate: string; endDate: string } {
  if (type === 'bi_monthly') {
    const m = key.match(RX_BI_MONTHLY);
    if (!m) throw new Error(`Invalid bi_monthly period_key: ${key}`);
    const year = Number.parseInt(m[1], 10);
    const b = Number.parseInt(m[2], 10);
    const startMonth = (b - 1) * 2 + 1;
    const start = new Date(Date.UTC(year, startMonth - 1, 1));
    const end = new Date(Date.UTC(year, startMonth + 1, 0));
    return { startDate: toDateKey(start), endDate: toDateKey(end) };
  }

  const parsed = parseTaskPeriodKey(type as SummaryType, key);
  return { startDate: parsed.startDate, endDate: parsed.endDate };
}

export function getChatChildPeriodKeys(type: ChatSummaryType, key: string): string[] {
  if (type === 'bi_monthly') {
    const m = key.match(RX_BI_MONTHLY);
    if (!m) throw new Error(`Invalid bi_monthly period_key: ${key}`);
    const year = Number.parseInt(m[1], 10);
    const b = Number.parseInt(m[2], 10);
    const m1 = (b - 1) * 2 + 1;
    const m2 = m1 + 1;
    return [`${year}-M${pad2(m1)}`, `${year}-M${pad2(m2)}`];
  }

  if (type === 'weekly') {
    const wm = key.match(/^(\d{4})-W(\d{2})$/);
    if (!wm) throw new Error(`Invalid weekly period_key: ${key}`);
    const days = isoWeekDateKeys(Number.parseInt(wm[1], 10), Number.parseInt(wm[2], 10));
    // שבוע שמסתיים בשבת — 6 ימים ראשונים (שני–שבת), בלי ראשון הבא
    return days.slice(0, 6);
  }

  return getTaskChildPeriodKeys(type as SummaryType, key);
}

export function isValidChatPeriodKey(type: ChatSummaryType, key: string): boolean {
  try {
    parseChatPeriodKey(type, key);
    return true;
  } catch {
    return false;
  }
}

export function chatPeriodUtcBounds(type: ChatSummaryType, periodKey: string): { start: Date; end: Date } {
  const { startDate, endDate } = parseChatPeriodKey(type, periodKey);
  const start = fromDateKey(startDate);
  const end = fromDateKey(endDate);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}
