/** Parse "HH:MM" → minutes from midnight (0–1439). */
export function parseHHMMToMinutes(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1]!, 10);
  const min = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

export function getIsraelNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}

type Anchor = { label: string; minutes: number };

/**
 * רמז זמן לפרומפט — "עוד ~25 דקות לפני ארוחת ערב" וכו'.
 */
export function buildScheduleProximityHint(anchors: Anchor[]): string | null {
  const now = getIsraelNowMinutes();
  let best: { label: string; delta: number } | null = null;

  for (const a of anchors) {
    let delta = a.minutes - now;
    if (delta < -12 * 60) delta += 24 * 60;
    if (delta > 12 * 60) delta -= 24 * 60;
    if (delta >= -90 && delta <= 90) {
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { label: a.label, delta };
      }
    }
  }

  if (!best) return null;
  const abs = Math.abs(best.delta);
  if (abs <= 5) return `עכשיו בערך זמן ${best.label} — אפשר לעגן את ההודעה לרגע הזה.`;
  if (best.delta > 0) {
    return `עוד בערך ${abs} דקות ל${best.label} — אפשר לעגן את ההודעה לפני (לא "עברו שעות").`;
  }
  return `לפני בערך ${abs} דקות היה ${best.label} — אפשר להתייחס ברכות אם רלוונטי.`;
}
