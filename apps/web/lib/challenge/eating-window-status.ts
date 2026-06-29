import { jerusalemMinutesIntoDay } from '@/lib/journey/task-schedule';
import type { EatingWindowConfig } from './types';

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((p) => Number.parseInt(p, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export type EatingWindowStatus = {
  is_open: boolean;
  label: string;
  minutes_until_close: number | null;
  minutes_until_open: number | null;
  progress_pct: number;
};

export function getEatingWindowStatus(
  config: EatingWindowConfig,
  now: Date = new Date(),
): EatingWindowStatus {
  const nowMin = jerusalemMinutesIntoDay(now);
  const startMin = parseHHMM(config.start);
  const endMin = parseHHMM(config.end);

  const windowSpan = endMin > startMin ? endMin - startMin : 24 * 60 - startMin + endMin;

  if (nowMin >= startMin && nowMin < endMin) {
    const remaining = endMin - nowMin;
    const elapsed = nowMin - startMin;
    return {
      is_open: true,
      label: `החלון פתוח — נסגר בעוד ${formatMinutesHe(remaining)}`,
      minutes_until_close: remaining,
      minutes_until_open: null,
      progress_pct: windowSpan > 0 ? Math.round((elapsed / windowSpan) * 100) : 0,
    };
  }

  if (nowMin < startMin) {
    const untilOpen = startMin - nowMin;
    return {
      is_open: false,
      label: `החלון נפתח בעוד ${formatMinutesHe(untilOpen)}`,
      minutes_until_close: null,
      minutes_until_open: untilOpen,
      progress_pct: 0,
    };
  }

  const untilOpen = 24 * 60 - nowMin + startMin;
  return {
    is_open: false,
    label: `החלון נסגר — נפתח מחר בעוד ${formatMinutesHe(untilOpen)}`,
    minutes_until_close: null,
    minutes_until_open: untilOpen,
    progress_pct: 100,
  };
}

function formatMinutesHe(mins: number): string {
  if (mins < 60) return `${mins} דק'`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} שע'`;
  return `${h}:${String(m).padStart(2, '0')} שע'`;
}

/** האם החלון נסגר בקרוב (ברירת מחדל: 10 דקות) */
export function isEatingWindowClosingSoon(
  config: EatingWindowConfig,
  now: Date = new Date(),
  thresholdMinutes = 10,
): boolean {
  const status = getEatingWindowStatus(config, now);
  return (
    status.is_open &&
    status.minutes_until_close != null &&
    status.minutes_until_close > 0 &&
    status.minutes_until_close <= thresholdMinutes
  );
}
