/**
 * פרמטרים לרשימת התראות — לוגיקה טהורה לבדיקות ול-API.
 */

/** סוגי התראות מותרים (תואם constraint בטבלה) */
export const NOTIFICATION_TYPES = [
  'lesson_reminder',
  'achievement',
  'streak',
  'ai_message',
  'plan_ready',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type ParsedInboxParams = {
  limit: number;
  /** תיבה ראשית — רק לא בארכיון */
  archived: boolean;
  unreadOnly: boolean;
  /** סוגים לפילטר — null או ריק = כל הסוגים */
  types: NotificationType[] | null;
  /** עימוד: created_at של הפריט האחרון מהדף הקודם (חוקי ISO) */
  cursor: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseBool(v: string | null, defaultFalse: boolean): boolean {
  if (v === null || v === '') return defaultFalse;
  const x = v.trim().toLowerCase();
  return x === '1' || x === 'true' || x === 'yes';
}

function parseTypes(raw: string | null): NotificationType[] | null {
  if (raw == null || raw.trim() === '') return null;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const allowed = new Set(NOTIFICATION_TYPES);
  const out: NotificationType[] = [];
  for (const p of parts) {
    if (allowed.has(p as NotificationType)) out.push(p as NotificationType);
  }
  return out.length ? out : null;
}

function parseLimit(raw: string | null): number {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function parseCursor(raw: string | null): string | null {
  if (raw == null || raw.trim() === '') return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/**
 * מפרש query string של GET /api/v1/notifications
 */
export function parseInboxSearchParams(searchParams: URLSearchParams): ParsedInboxParams {
  const archived = parseBool(searchParams.get('archived'), false);
  const unreadOnly = parseBool(searchParams.get('unread_only'), false);
  const types = parseTypes(searchParams.get('types'));
  const limit = parseLimit(searchParams.get('limit'));
  const cursor = parseCursor(searchParams.get('cursor'));

  return {
    limit,
    archived,
    unreadOnly,
    types,
    cursor,
  };
}

export function nextCursorFromRows(rows: { created_at: string }[], limit: number): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1]?.created_at;
  return typeof last === 'string' ? last : null;
}
