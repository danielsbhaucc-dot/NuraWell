import type { FrictionCategory, StrategyType } from './almog-commitments/friction';

export type RiskWindow = {
  weekday: number | null;
  start_hhmm: string;
  duration_min: number;
  trigger: FrictionCategory;
  confidence: number;
  sample_size: number;
  distinct_dates: number;
};

export type RiskFingerprint = {
  windows: RiskWindow[];
  helped_strategies: StrategyType[];
  red_flag_at?: string | null;
  ed_caution?: boolean;
  computed_at: string;
  model: string;
};

export type GuardianScheduledWindow = {
  window: RiskWindow;
  triggerAt: Date;
  windowStart: Date;
  leadMin: number;
};

const JERUSALEM_TIMEZONE = 'Asia/Jerusalem';

function localParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JERUSALEM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayLabel = get('weekday');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayLabel);
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekday >= 0 ? weekday : 0,
  };
}

function israelLocalDateAtUtc(local: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const guessUtc = new Date(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0));
  const israelShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: JERUSALEM_TIMEZONE }));
  const utcShown = new Date(guessUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = israelShown.getTime() - utcShown.getTime();
  return new Date(guessUtc.getTime() - offsetMs);
}

function parseHhmm(hhmm: string): { hour: number; minute: number } | null {
  const match = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function nextGuardianTriggerForWindow(
  window: RiskWindow,
  now = new Date(),
  leadMin = 30
): GuardianScheduledWindow | null {
  if (window.confidence < 0.6 || window.sample_size < 3 || window.distinct_dates < 2) return null;
  const parsed = parseHhmm(window.start_hhmm);
  if (!parsed) return null;

  const today = localParts(now);
  if (window.weekday != null && window.weekday !== today.weekday) return null;

  const windowStart = israelLocalDateAtUtc({
    year: today.year,
    month: today.month,
    day: today.day,
    hour: parsed.hour,
    minute: parsed.minute,
  });
  const triggerAt = new Date(windowStart.getTime() - leadMin * 60 * 1000);

  // The morning cron schedules only future same-day touches.
  if (triggerAt.getTime() <= now.getTime()) return null;

  return { window, triggerAt, windowStart, leadMin };
}

export function guardianSchedulesForToday(
  fingerprint: RiskFingerprint | null | undefined,
  now = new Date(),
  leadMin = 30
): GuardianScheduledWindow[] {
  if (!fingerprint || fingerprint.red_flag_at || fingerprint.ed_caution) return [];
  return (fingerprint.windows ?? [])
    .map((window) => nextGuardianTriggerForWindow(window, now, leadMin))
    .filter((item): item is GuardianScheduledWindow => item !== null)
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
}
