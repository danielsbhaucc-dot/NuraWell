const IL_TZ = 'Asia/Jerusalem';

/** Parse "HH:MM" or "HH:MM:SS" → minutes from midnight */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.trim().split(':').map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Minutes now in Israel */
export function israelNowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

/** Circular diff in minutes (handles midnight) */
export function minutesApart(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 24 * 60 - d);
}

/**
 * True if `checkInTime` is within ±windowMinutes of now (Israel).
 * Cron מומלץ: כל 30 דקות (`0,30 * * * *`) כדי לא לפספס slots כמו 07:45.
 */
export function isCheckInDueNow(
  checkInTime: string,
  now: Date = new Date(),
  windowMinutes = 30
): boolean {
  const slot = parseTimeToMinutes(checkInTime);
  if (!Number.isFinite(slot)) return false;
  return minutesApart(israelNowMinutes(now), slot) <= windowMinutes;
}

/** Normalize Postgres time[] to "HH:MM" strings */
export function normalizeCheckInTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (typeof t !== 'string') return null;
      const m = t.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    })
    .filter((t): t is string => Boolean(t));
}

export function israelDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
