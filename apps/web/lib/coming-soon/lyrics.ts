import { z } from 'zod';

/* ============================================================
 * תזמוני מילות השיר לעמוד "בקרוב".
 * נשמרים ב-site_settings.coming_soon_lyrics (jsonb) ונערכים
 * ממערכת הסנכרון בלוח הבקרה ("תקתוק" שורות בזמן אמת).
 * start = שניות מוחלטות לתוך קובץ האודיו (כולל אינטרו שקט).
 * ============================================================ */

export type LyricKind = 'normal' | 'drop' | 'mega';

export interface LyricLineConfig {
  text: string;
  /** זמן התחלה (שניות) לתוך השיר — שווה לזמן המילה הראשונה */
  start: number;
  /** זמני התחלה לכל מילה (שניות מוחלטות), מיושר ל-splitWords(text). אופציונלי. */
  wordStarts?: number[];
  kind?: LyricKind;
  /** תווית קטנה (למשל "כן!") שמופיעה ליד שורת drop */
  tag?: string;
}

export interface ComingSoonLyrics {
  /** היסט סנכרון גלובלי (שניות) — מקדים/מאחר את כל ההדגשות */
  syncOffset?: number;
  lines: LyricLineConfig[];
}

export interface ResolvedLyricLine {
  text: string;
  start: number;
  end: number;
  kind: LyricKind;
  tag?: string;
  /** זמני מילים מוחלטים (אם תוזמנו פר-מילה); אחרת undefined → פיזור שווה */
  wordStarts?: number[];
}

/** ספליט מילים אחיד — חייב להיות זהה בכל מקום שמשתמש ב-wordStarts */
export function splitLyricWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** האינדקס של המילה הפעילה בשורה, לפי זמן נוכחי (שניות, כולל offset) */
export function activeWordIndex(line: ResolvedLyricLine, ct: number): number {
  const words = splitLyricWords(line.text);
  if (words.length === 0) return -1;
  const starts = line.wordStarts;
  if (starts && starts.length === words.length) {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) {
      if (ct >= starts[i]) idx = i;
    }
    return idx;
  }
  // פיזור שווה לאורך משך השורה
  const frac = (ct - line.start) / Math.max(0.001, line.end - line.start);
  return Math.max(0, Math.min(words.length - 1, Math.floor(frac * words.length)));
}

export interface ResolvedLyrics {
  syncOffset: number;
  lines: ResolvedLyricLine[];
  endsAt: number;
}

export const DEFAULT_SYNC_OFFSET = 0.18;

/** ברירת מחדל — שיר 30 שניות עם ~3 שניות אינטרו שקט */
export const DEFAULT_LYRICS: ComingSoonLyrics = {
  syncOffset: DEFAULT_SYNC_OFFSET,
  lines: [
    { text: 'הלילה נצבע באור חדש', start: 3.4 },
    { text: 'הלב נפתח, אין בו חשש', start: 7.3 },
    { text: 'לרקוד איתך עד אינסוף', start: 11.2 },
    { text: 'לגלות את כל היופי שוב', start: 15.1 },
    { text: 'NuraWell', start: 19.0, kind: 'drop', tag: 'כן!' },
    { text: 'NuraWell', start: 21.6, kind: 'drop' },
    { text: 'מרגיש הכי חזק שיש', start: 24.0 },
    { text: 'NuraWell!!!', start: 27.4, kind: 'mega' },
  ],
};

export const lyricLineSchema = z.object({
  text: z.string().trim().min(1).max(160),
  start: z.number().min(0).max(600),
  wordStarts: z.array(z.number().min(0).max(600)).max(40).optional(),
  kind: z.enum(['normal', 'drop', 'mega']).optional(),
  tag: z.string().trim().max(40).optional(),
});

export const comingSoonLyricsSchema = z.object({
  syncOffset: z.number().min(-3).max(3).optional(),
  lines: z.array(lyricLineSchema).min(1).max(40),
});

/** ממיין לפי start וגוזר זמני סיום (כל שורה מסתיימת בתחילת הבאה). */
export function resolveLyrics(
  cfg: ComingSoonLyrics | null | undefined,
  songDuration?: number | null,
): ResolvedLyrics {
  const source =
    cfg && Array.isArray(cfg.lines) && cfg.lines.length > 0 ? cfg : DEFAULT_LYRICS;
  const syncOffset = typeof source.syncOffset === 'number' ? source.syncOffset : DEFAULT_SYNC_OFFSET;

  const sorted = [...source.lines]
    .map((l) => ({
      text: l.text,
      start: Math.max(0, l.start),
      kind: (l.kind ?? 'normal') as LyricKind,
      tag: l.tag,
      wordStarts: Array.isArray(l.wordStarts) ? l.wordStarts : undefined,
    }))
    .sort((a, b) => a.start - b.start);

  const lastStart = sorted.length ? sorted[sorted.length - 1].start : 0;
  const fallbackEnd =
    songDuration && Number.isFinite(songDuration) && songDuration > lastStart
      ? songDuration
      : lastStart + 3;

  const lines: ResolvedLyricLine[] = sorted.map((l, i) => ({
    ...l,
    end: i < sorted.length - 1 ? sorted[i + 1].start : fallbackEnd,
  }));

  return { syncOffset, lines, endsAt: fallbackEnd };
}

/** המרה בטוחה מ-jsonb (unknown) לקונפיג מילים, או null אם לא תקין. */
export function parseLyricsConfig(raw: unknown): ComingSoonLyrics | null {
  const parsed = comingSoonLyricsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
