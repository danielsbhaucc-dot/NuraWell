/**
 * Cloudflare Worker – נתב לשלושה דליי R2 + Cache API לתמונות/אודיו.
 * מבוסס על הלוגיקה המקורית (403 ב-root, 400 לנתיב לא תקין, מטא־דאטה מ-R2)
 * עם הרחבות: קאש לתמונות, לוגים, 503 אם R2 נופל, ותמיכת Range לאודיו.
 *
 * נתיבים ציבוריים:
 *   /images/*  → MAIN_BUCKET   (קאש edge, cache ארוך)
 *   /files/*   → FILES_BUCKET  (private, ללא קאש)
 *   /audio/*   → AUDIO_BUCKET  (מוזיקת רקע לשיעורים, תמיכת Range + קאש ארוך)
 */

export interface Env {
  MAIN_BUCKET: R2Bucket;
  FILES_BUCKET: R2Bucket;
  AUDIO_BUCKET: R2Bucket;
  /**
   * אופציונלי: סוד לגישה לנתיב /files/*.
   * אם מוגדר, כל בקשה ל-/files/* חייבת לכלול ?key=<FILES_ACCESS_KEY>
   * (למעט OPTIONS/HEAD ללא גוף).
   * אם לא מוגדר — התנהגות קיימת (ציבורי).
   */
  FILES_ACCESS_KEY?: string;
}

type RouteLabel = 'images' | 'files' | 'audio';

const IMAGE_EXTENSIONS_CACHE = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'svg',
  'ico',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'wav',
  'flac',
  'webm',
]);

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

function extname(path: string): string {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

function shouldUseEdgeCache(pathname: string, routeLabel: RouteLabel): boolean {
  const ext = extname(pathname);
  if (routeLabel === 'audio') return AUDIO_EXTENSIONS.has(ext);
  return IMAGE_EXTENSIONS_CACHE.has(ext);
}

/** 30 יום תמונות, שנה SVG/ICO + אודיו (immutable, keyed by uuid), שבוע GIF */
function browserCacheControl(pathname: string, routeLabel: RouteLabel): string {
  const ext = extname(pathname);
  if (routeLabel === 'audio') {
    // אובייקטי אודיו ממופתחים לפי UUID של רצועה → לעולם לא משתנים
    return 'public, max-age=31536000, immutable';
  }
  if (ext === 'svg' || ext === 'ico') {
    return 'public, max-age=31536000, immutable';
  }
  if (ext === 'gif') {
    return 'public, max-age=604800';
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext)) {
    return 'public, max-age=2592000, immutable';
  }
  return 'public, max-age=3600';
}

/** כמו path.replace('/images/', '') אבל עם תווים מקודדים בכתובת */
function keyFromPath(prefix: string, pathname: string): string | null {
  const raw = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function isForbiddenKey(key: string): boolean {
  if (!key || key.startsWith('/')) return true;
  for (const seg of key.split('/')) {
    if (seg === '..') return true;
  }
  return false;
}

function logLine(
  request: Request,
  phase: 'HIT' | 'MISS' | 'R2',
  detail?: string
): void {
  const url = new URL(request.url);
  console.log(
    `[cdn] ${request.method} ${url.pathname} → ${phase}${detail ? ` ${detail}` : ''}`
  );
}

type ParsedRange = { offset: number; length?: number } | { suffix: number };

/** ניתוח כותרת Range יחידה (bytes=start-end / bytes=start- / bytes=-suffix). */
function parseRangeHeader(header: string | null): ParsedRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  if (startStr === '' && endStr === '') return null;
  if (startStr === '') {
    const n = Number.parseInt(endStr, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { suffix: n };
  }
  const start = Number.parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0) return null;
  if (endStr === '') return { offset: start };
  const end = Number.parseInt(endStr, 10);
  if (!Number.isFinite(end) || end < start) return null;
  return { offset: start, length: end - start + 1 };
}

async function r2GetSafe(
  bucket: R2Bucket,
  key: string,
  options?: R2GetOptions
): Promise<R2ObjectBody | R2Object | null> {
  try {
    return await bucket.get(key, options);
  } catch (e) {
    console.error('[cdn] R2 error', key, e);
    throw e;
  }
}

function response503(): Response {
  return new Response(
    JSON.stringify({
      error: 'שירות האחסון זמנית לא זמין. נסה שוב בעוד רגע.',
      code: 'STORAGE_UNAVAILABLE',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': '30',
      },
    }
  );
}

function baseHeaders(
  object: R2Object,
  pathname: string,
  routeLabel: RouteLabel
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (!headers.get('Content-Type')) {
    if (routeLabel === 'audio') {
      headers.set(
        'Content-Type',
        AUDIO_CONTENT_TYPES[extname(pathname)] ?? 'audio/mpeg'
      );
    } else {
      headers.set('Content-Type', 'application/octet-stream');
    }
  }

  headers.set('etag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');

  if (routeLabel === 'files') {
    headers.set('Cache-Control', 'private, no-cache');
  } else {
    headers.set('Cache-Control', browserCacheControl(pathname, routeLabel));
  }

  if (routeLabel === 'audio') {
    headers.set('Accept-Ranges', 'bytes');
  }

  return headers;
}

/**
 * הגשת Range לאודיו עם קאש Edge: שומרים את הקובץ המלא ב-Cache API ופורסים ממנו
 * את ה-Range. כך הבקשה הראשונה ממלאת את הקאש, וכל השאר נשלפות מהר מה-Edge
 * במקום מ-R2 בכל ניגון.
 */
async function serveRangedAudio(params: {
  bucket: R2Bucket;
  key: string;
  request: Request;
  ctx: ExecutionContext;
  routeLabel: RouteLabel;
  pathname: string;
  parsedRange: ParsedRange;
  tryEdgeCache: boolean;
}): Promise<Response> {
  const { bucket, key, request, ctx, routeLabel, pathname, parsedRange, tryEdgeCache } = params;

  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const cache = caches.default;
  const useCache = tryEdgeCache && shouldUseEdgeCache(pathname, routeLabel);

  let buf: ArrayBuffer | null = null;
  let baseRespHeaders: Headers | null = null;

  if (useCache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        logLine(request, 'HIT', `${routeLabel} range`);
        buf = await cached.arrayBuffer();
        baseRespHeaders = new Headers(cached.headers);
      }
    } catch (e) {
      console.warn('[cdn] cache.match (range) failed', e);
    }
  }

  if (!buf) {
    let object: R2ObjectBody | R2Object | null;
    try {
      object = await r2GetSafe(bucket, key);
    } catch {
      return response503();
    }
    if (!object) {
      logLine(request, 'R2', `${routeLabel} 404`);
      return new Response('Object Not Found', { status: 404 });
    }
    baseRespHeaders = baseHeaders(object, pathname, routeLabel);
    buf = await (object as R2ObjectBody).arrayBuffer();
    logLine(request, 'MISS', `${routeLabel} range`);
    if (useCache) {
      const full200 = new Response(buf.slice(0), { status: 200, headers: baseRespHeaders });
      ctx.waitUntil(cache.put(cacheKey, full200));
    }
  }

  if (!buf) {
    return new Response('Object Not Found', { status: 404 });
  }

  const total = buf.byteLength;
  let start: number;
  let end: number;
  if ('suffix' in parsedRange) {
    start = Math.max(0, total - parsedRange.suffix);
    end = total - 1;
  } else {
    start = parsedRange.offset;
    end =
      parsedRange.length != null
        ? Math.min(total - 1, start + parsedRange.length - 1)
        : total - 1;
  }

  if (start >= total) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }

  const headers = new Headers(baseRespHeaders ?? undefined);
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');

  const isHead = request.method === 'HEAD';
  const body = isHead ? null : buf.slice(start, end + 1);

  return new Response(body, { status: 206, headers });
}

async function serveFromBucket(params: {
  bucket: R2Bucket;
  key: string;
  request: Request;
  ctx: ExecutionContext;
  routeLabel: RouteLabel;
  pathname: string;
  tryEdgeCache: boolean;
  supportRange: boolean;
}): Promise<Response> {
  const {
    bucket,
    key,
    request,
    ctx,
    routeLabel,
    pathname,
    tryEdgeCache,
    supportRange,
  } = params;

  if (isForbiddenKey(key)) {
    return new Response('Access Denied', { status: 403 });
  }

  const isGet = request.method === 'GET';
  const isHead = request.method === 'HEAD';

  const parsedRange = supportRange ? parseRangeHeader(request.headers.get('Range')) : null;

  // בקשת Range → תשובת 206, מוגשת מקאש ה-Edge (הקובץ המלא נשמר ונפרס).
  if (parsedRange) {
    return serveRangedAudio({
      bucket,
      key,
      request,
      ctx,
      routeLabel,
      pathname,
      parsedRange,
      tryEdgeCache,
    });
  }

  const cache = caches.default;
  const cacheRequest = new Request(request.url, request);

  const useCacheApi = tryEdgeCache && isGet && shouldUseEdgeCache(pathname, routeLabel);

  if (useCacheApi) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        logLine(request, 'HIT', routeLabel);
        return cached;
      }
    } catch (e) {
      console.warn('[cdn] cache.match failed', e);
    }
    logLine(request, 'MISS', routeLabel);
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await r2GetSafe(bucket, key);
  } catch {
    return response503();
  }

  if (!object) {
    logLine(request, 'R2', `${routeLabel} 404`);
    return new Response('Object Not Found', { status: 404 });
  }

  logLine(request, 'R2', `${routeLabel} ok`);

  const headers = baseHeaders(object, pathname, routeLabel);

  const objectBody = (object as R2ObjectBody).body ?? null;
  const body = isHead ? null : objectBody;
  const response = new Response(body, {
    status: 200,
    headers,
  });

  if (useCacheApi && objectBody) {
    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
  }

  return response;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    /** 1. אבטחה: חסימת גישה לכתובת הראשית — כמו בקוד המקורי שלך */
    if (path === '/' || path === '') {
      return new Response('Access Denied', { status: 403 });
    }

    let pathname = path;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    try {
      /** 2–4. ניתוב תמונות / קבצים / אודיו */
      if (pathname.startsWith('/images/')) {
        const key = keyFromPath('/images/', pathname);
        if (!key) {
          return new Response('Object Not Found', { status: 404 });
        }
        return serveFromBucket({
          bucket: env.MAIN_BUCKET,
          key,
          request,
          ctx,
          routeLabel: 'images',
          pathname,
          tryEdgeCache: true,
          supportRange: false,
        });
      }

      if (pathname.startsWith('/files/')) {
        // אימות אופציונלי: אם FILES_ACCESS_KEY מוגדר, דורש ?key=<secret>
        const filesAccessKey = env.FILES_ACCESS_KEY?.trim();
        if (filesAccessKey) {
          const queryKey = url.searchParams.get('key');
          if (!queryKey || queryKey !== filesAccessKey) {
            return new Response('Forbidden', { status: 403 });
          }
        }

        const key = keyFromPath('/files/', pathname);
        if (!key) {
          return new Response('Object Not Found', { status: 404 });
        }
        return serveFromBucket({
          bucket: env.FILES_BUCKET,
          key,
          request,
          ctx,
          routeLabel: 'files',
          pathname,
          tryEdgeCache: false,
          supportRange: false,
        });
      }

      if (pathname.startsWith('/audio/')) {
        // חסימת גלישה ישירה לכתובת השיר (טאב חדש → נגן עם כפתור הורדה).
        // חוסמים רק ניווט עליון אמיתי (Sec-Fetch-Mode: navigate); נגן <audio>
        // משתמש ב-mode: no-cors ו-prefetch ב-cors — שניהם ממשיכים לעבוד.
        const fetchMode = request.headers.get('Sec-Fetch-Mode');
        const fetchDest = request.headers.get('Sec-Fetch-Dest');
        if (fetchMode === 'navigate' && fetchDest === 'document') {
          return new Response('Access Denied', { status: 403 });
        }
        const key = keyFromPath('/audio/', pathname);
        if (!key) {
          return new Response('Object Not Found', { status: 404 });
        }
        return serveFromBucket({
          bucket: env.AUDIO_BUCKET,
          key,
          request,
          ctx,
          routeLabel: 'audio',
          pathname,
          tryEdgeCache: true,
          supportRange: true,
        });
      }

      /** 5. נתיב לא מוכר */
      return new Response('Invalid Path. Use /images/, /files/ or /audio/', { status: 400 });
    } catch (e) {
      console.error('[cdn] unhandled', e);
      return response503();
    }
  },
};
