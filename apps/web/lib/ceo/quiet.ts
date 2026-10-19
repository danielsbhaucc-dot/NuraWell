import { HebrewCalendar, Location, TimedEvent } from '@hebcal/core';

/**
 * Quiet time for Gideon's outbound messages (pure, no DB): Shabbat / Yom Tov windows computed per date
 * with @hebcal/core (offline astronomical calc: candle lighting = sunset − N min, end = tzeit 8.5°),
 * plus Daniel's quiet hours and one-off "quiet until".
 */
export const TZ = 'Asia/Jerusalem';
export const SHABBAT_CITIES = ['Jerusalem', 'Tel Aviv', 'Haifa', 'Beer Sheva', 'Ashdod', 'Petach Tikvah', 'Tiberias', 'Eilat'] as const;
export const CITY_HE: Record<string, string> = {
  Jerusalem: 'ירושלים', 'Tel Aviv': 'תל אביב', Haifa: 'חיפה', 'Beer Sheva': 'באר שבע', Ashdod: 'אשדוד', 'Petach Tikvah': 'פתח תקווה', Tiberias: 'טבריה', Eilat: 'אילת',
};

export type Emergencies = 'hold' | 'allow';
export type ShabbatParams = { city: string; candle_mins: number; yom_tov: boolean; emergencies: Emergencies };
export const DEFAULT_SHABBAT: ShabbatParams = { city: 'Jerusalem', candle_mins: 40, yom_tov: true, emergencies: 'hold' };

export type PrefKind = 'shabbat' | 'quiet_hours' | 'quiet_until' | 'mute_topic' | 'note';
export type OwnerPref = {
  id: string;
  kind: PrefKind;
  label: string;
  params: Record<string, unknown>;
  active: boolean;
  source?: string;
  expires_at?: string | null;
};

export type Window = { start: Date; end: Date; reason: 'shabbat' | 'yom_tov' | 'quiet_hours' | 'quiet_until'; prefId?: string; emergencies: Emergencies };

export function shabbatParams(p: Record<string, unknown> | undefined): ShabbatParams {
  const city = typeof p?.city === 'string' && Location.lookup(p.city) ? p.city : DEFAULT_SHABBAT.city;
  const mins = Number(p?.candle_mins);
  return {
    city,
    candle_mins: Number.isFinite(mins) && mins >= 0 && mins <= 60 ? Math.round(mins) : DEFAULT_SHABBAT.candle_mins,
    yom_tov: p?.yom_tov !== false,
    emergencies: p?.emergencies === 'allow' ? 'allow' : 'hold',
  };
}

/** Israel weekday (0=Sun) of an instant. */
export function ilWeekday(d: Date): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
}

function ilParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute) };
}

/** Instant of a wall-clock time in Israel (DST-safe). m is 1-based; day overflow is fine. */
export function ilTime(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = ilParts(new Date(t));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    t += guess - asUtc;
  }
  return new Date(t);
}

/**
 * Shabbat (and optionally Yom Tov) windows overlapping [from, to]: candle lighting → tzeit (havdalah).
 * Consecutive holy days (Yom Tov next to Shabbat, 2-day Rosh Hashana) merge into one window.
 */
export function holyWindows(from: Date, to: Date, p: ShabbatParams = DEFAULT_SHABBAT): Window[] {
  try {
    const loc = Location.lookup(p.city) ?? Location.lookup('Jerusalem')!;
    const evs = HebrewCalendar.calendar({
      start: new Date(from.getTime() - 3 * 86_400_000),
      end: new Date(to.getTime() + 3 * 86_400_000),
      location: loc,
      candlelighting: true,
      candleLightingMins: p.candle_mins,
      il: true,
    })
      .filter((e): e is TimedEvent => e instanceof TimedEvent && (e.getDesc() === 'Candle lighting' || e.getDesc() === 'Havdalah'))
      .map((e) => ({ at: e.eventTime, light: e.getDesc() === 'Candle lighting' }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const out: Window[] = [];
    let open: Date | null = null;
    let yomTov = false;
    for (const e of evs) {
      const dow = ilWeekday(e.at);
      if (!p.yom_tov) {
        // Shabbat only: Friday candle lighting → Saturday night (havdalah, or tzeit-lighting into Yom Tov)
        if (e.light && dow === 5 && !open) open = e.at;
        else if (dow === 6 && open) {
          out.push({ start: open, end: e.at, reason: 'shabbat', emergencies: p.emergencies });
          open = null;
        }
        continue;
      }
      if (e.light) {
        if (!open) {
          open = e.at;
          yomTov = dow !== 5;
        }
      } else if (open) {
        out.push({ start: open, end: e.at, reason: yomTov && dow !== 6 ? 'yom_tov' : 'shabbat', emergencies: p.emergencies });
        open = null;
      }
    }
    return out.filter((w) => w.end > from && w.start < to);
  } catch {
    return fallbackShabbat(from, to, p.emergencies);
  }
}

/** Conservative fallback if the calendar lib fails: Friday 16:00 → Saturday 20:00 Israel time. */
export function fallbackShabbat(from: Date, to: Date, emergencies: Emergencies = 'hold'): Window[] {
  const out: Window[] = [];
  for (let t = from.getTime() - 7 * 86_400_000; t <= to.getTime() + 86_400_000; t += 86_400_000) {
    const d = new Date(t);
    if (ilWeekday(d) !== 5) continue;
    const p = ilParts(d);
    const w: Window = { start: ilTime(p.y, p.m, p.d, 16, 0), end: ilTime(p.y, p.m, p.d + 1, 20, 0), reason: 'shabbat', emergencies };
    if (w.end > from && w.start < to) out.push(w);
  }
  return out;
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function quietHourWindows(pref: OwnerPref, from: Date, to: Date): Window[] {
  const f = String(pref.params.from ?? '').match(HHMM);
  const t = String(pref.params.to ?? '').match(HHMM);
  if (!f || !t) return [];
  const days = Array.isArray(pref.params.days) ? (pref.params.days as number[]) : null;
  const emergencies: Emergencies = pref.params.emergencies === 'allow' ? 'allow' : 'hold';
  const out: Window[] = [];
  for (let x = from.getTime() - 2 * 86_400_000; x <= to.getTime() + 86_400_000; x += 86_400_000) {
    const p = ilParts(new Date(x));
    const start = ilTime(p.y, p.m, p.d, Number(f[1]), Number(f[2]));
    if (days && !days.includes(ilWeekday(start))) continue;
    const overnight = Number(t[1]) * 60 + Number(t[2]) <= Number(f[1]) * 60 + Number(f[2]);
    const end = ilTime(p.y, p.m, p.d + (overnight ? 1 : 0), Number(t[1]), Number(t[2]));
    if (end > from && start < to) out.push({ start, end, reason: 'quiet_hours', prefId: pref.id, emergencies });
  }
  return out;
}

export function isLive(p: OwnerPref, now: Date): boolean {
  return p.active && (!p.expires_at || Date.parse(p.expires_at) > now.getTime());
}

/** All quiet windows from the active prefs overlapping [from, to]. */
export function quietWindows(prefs: OwnerPref[], from: Date, to: Date): Window[] {
  const out: Window[] = [];
  for (const p of prefs) {
    if (!p.active || (p.expires_at && Date.parse(p.expires_at) <= from.getTime())) continue;
    if (p.kind === 'shabbat') out.push(...holyWindows(from, to, shabbatParams(p.params)).map((w) => ({ ...w, prefId: p.id })));
    if (p.kind === 'quiet_hours') out.push(...quietHourWindows(p, from, to));
    if (p.kind === 'quiet_until') {
      const end = Date.parse(String(p.params.until ?? p.expires_at ?? ''));
      const start = Date.parse(String(p.params.from ?? '')) || 0;
      if (end) out.push({ start: new Date(start), end: new Date(end), reason: 'quiet_until', prefId: p.id, emergencies: p.params.emergencies === 'allow' ? 'allow' : 'hold' });
    }
  }
  return out.filter((w) => w.end > from && w.start < to).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type QuietState = { quiet: false } | { quiet: true; until: Date; reasons: Window['reason'][]; emergencies: Emergencies };

/** Is `now` quiet? `until` = when quiet ends (overlapping/adjacent windows chained). */
export function quietState(prefs: OwnerPref[], now = new Date()): QuietState {
  const ws = quietWindows(prefs, new Date(now.getTime() - 3 * 86_400_000), new Date(now.getTime() + 10 * 86_400_000));
  const cur = ws.filter((w) => w.start <= now && w.end > now);
  if (!cur.length) return { quiet: false };
  let until = new Date(Math.max(...cur.map((w) => w.end.getTime())));
  const used = new Set(cur);
  for (let changed = true; changed; ) {
    changed = false;
    for (const w of ws) {
      if (!used.has(w) && w.start <= until && w.end > until) {
        until = w.end;
        used.add(w);
        changed = true;
      }
    }
  }
  const all = [...used];
  return { quiet: true, until, reasons: [...new Set(all.map((w) => w.reason))], emergencies: all.every((w) => w.emergencies === 'allow') ? 'allow' : 'hold' };
}

/** Presets Gideon can use instead of computing timestamps itself. */
export function resolveUntil(preset: string, now = new Date(), prefs: OwnerPref[] = []): Date | null {
  const p = ilParts(now);
  if (preset === 'end_of_today') return ilTime(p.y, p.m, p.d + 1, 0, 0);
  if (preset === 'tomorrow_morning') return ilTime(p.y, p.m, p.d + 1, 8, 0);
  if (preset === 'end_of_shabbat') {
    const sh = prefs.find((x) => x.kind === 'shabbat');
    const ws = holyWindows(now, new Date(now.getTime() + 8 * 86_400_000), shabbatParams(sh?.params ?? {}));
    return ws.find((w) => w.end > now)?.end ?? null;
  }
  const t = Date.parse(preset);
  return Number.isFinite(t) && t > now.getTime() ? new Date(t) : null;
}

export const fmtIl = (d: Date) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
