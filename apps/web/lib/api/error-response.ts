import { NextResponse } from 'next/server';

/**
 * Helper מאוחד לתגובות שגיאה ב-API. הסיבה: כמה routes החזירו ללקוח את
 * `error.code`, `error.message`, `error.details`, `error.hint` של Supabase
 * ישירות — מידע שעוזר לתוקף לאסוף מודיעין על schema ו-RLS.
 *
 * תפקידי helper:
 *   1) ב-production – החזרת תגובה גנרית עם `requestId` בלבד.
 *   2) ב-development / preview – החזרת פרטים מלאים לפיתוח.
 *   3) פלטה אחידה: log חתום עם requestId כך שאפשר לקשר לוג ל-תגובה ללקוח.
 */

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function generateRequestId(): string {
  /** מספיק טוב למזהה לוג. לא חייב להיות UUID אמיתי. */
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type LikeSupabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type ApiErrorOptions = {
  /** קוד HTTP status. ברירת מחדל 500. */
  status?: number;
  /** הודעה ידידותית למשתמש (תמיד מוחזרת ללקוח). */
  publicMessage?: string;
  /**
   * שגיאה פנימית לתעד בלוגים. לא נוזלת ללקוח ב-production.
   */
  internal?: unknown;
  /**
   * תייגת לוג כדי לאתר ב-Vercel Logs (לדוגמה `notifications:GET`).
   */
  logTag?: string;
  /**
   * ב-development הקוד מצרף גם פרטים פנימיים. אפשר לכבות עם `false`.
   */
  exposeInternalInDev?: boolean;
};

/**
 * תגובת שגיאה בטוחה עבור API. עוטפת לוג של ה-internal עם requestId כך
 * שאפשר לקשר את הלוג לתגובה שהמשתמש קיבל.
 */
export function apiErrorResponse(opts: ApiErrorOptions = {}): NextResponse {
  const status = opts.status ?? 500;
  const publicMessage = opts.publicMessage ?? defaultMessageForStatus(status);
  const requestId = generateRequestId();
  const tag = opts.logTag ?? 'api';

  // Logging — תמיד עם requestId כדי לקשר לתגובת לקוח.
  if (opts.internal !== undefined) {
    // eslint-disable-next-line no-console
    console.error(`[${tag}] [${requestId}]`, opts.internal);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[${tag}] [${requestId}] ${publicMessage}`);
  }

  const body: Record<string, unknown> = {
    error: publicMessage,
    requestId,
  };

  /**
   * ב-development מצרפים פרטים. ב-production *אף פעם* לא חושפים.
   */
  if (!isProduction() && opts.exposeInternalInDev !== false && opts.internal) {
    body.debug = sanitizeInternalForDev(opts.internal);
  }

  return NextResponse.json(body, { status });
}

/**
 * אדפטר ספציפי לשגיאות Supabase: ב-dev מציג code/message/details/hint כמו
 * שהיה; ב-prod מציג רק error+requestId.
 */
export function supabaseApiError(
  error: LikeSupabaseError | null | undefined,
  opts: Omit<ApiErrorOptions, 'internal'> & { internal?: unknown } = {}
): NextResponse {
  return apiErrorResponse({
    ...opts,
    internal: opts.internal ?? error,
  });
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable entity';
    case 429:
      return 'Too many requests';
    default:
      return 'Internal server error';
  }
}

function sanitizeInternalForDev(internal: unknown): unknown {
  if (!internal || typeof internal !== 'object') return internal;
  /** הסר רק properties רגישות שעלולות להיות בלוג Error */
  const e = internal as Record<string, unknown>;
  return {
    name: e.name,
    code: e.code,
    message: typeof e.message === 'string' ? e.message : undefined,
    details: typeof e.details === 'string' ? e.details : undefined,
    hint: typeof e.hint === 'string' ? e.hint : undefined,
    stack: typeof e.stack === 'string' ? e.stack : undefined,
  };
}
