/**
 * Cloudflare Worker – נתב לשני דליי R2 + Cache API לתמונות בלבד.
 * מבוסס על הלוגיקה המקורית (403 ב-root, 400 לנתיב לא תקין, מטא־דאטה מ-R2)
 * עם הרחבות: קאש לתמונות, לוגים, 503 אם R2 נופל.
 */

export interface Env {
  MAIN_BUCKET: R2Bucket;
  FILES_BUCKET: R2Bucket;
}

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

function extname(path: string): string {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

function shouldUseEdgeCache(pathname: string): boolean {
  return IMAGE_EXTENSIONS_CACHE.has(extname(pathname));
}

/** 30 יום תמונות, שנה SVG/ICO, שבוע GIF */
function browserCacheControl(pathname: string): string {
  const ext = extname(pathname);
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

async function r2GetSafe(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  try {
    return await bucket.get(key);
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

async function serveFromBucket(params: {
  bucket: R2Bucket;
  key: string;
  request: Request;
  ctx: ExecutionContext;
  routeLabel: 'images' | 'files';
  pathname: string;
  tryEdgeCache: boolean;
}): Promise<Response> {
  const { bucket, key, request, ctx, routeLabel, pathname, tryEdgeCache } = params;

  if (isForbiddenKey(key)) {
    return new Response('Access Denied', { status: 403 });
  }

  const isGet = request.method === 'GET';
  const isHead = request.method === 'HEAD';

  const cache = caches.default;
  const cacheRequest = new Request(request.url, request);

  const useCacheApi = tryEdgeCache && isGet && shouldUseEdgeCache(pathname);

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

  let object: R2Object | null;
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

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (!headers.get('Content-Type')) {
    headers.set('Content-Type', 'application/octet-stream');
  }

  headers.set('etag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');

  if (routeLabel === 'files') {
    headers.set('Cache-Control', 'private, no-cache');
  } else {
    headers.set('Cache-Control', browserCacheControl(pathname));
  }

  const body = isHead ? null : object.body;
  const response = new Response(body, {
    status: 200,
    headers,
  });

  if (useCacheApi && object.body) {
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
      /** 2–3. ניתוב תמונות וקבצים — אותם נתיבים, אותם דליים */
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
        });
      }

      if (pathname.startsWith('/files/')) {
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
        });
      }

      /** 4. נתיב לא מוכר — כמו בקוד המקורי שלך */
      return new Response('Invalid Path. Use /images/ or /files/', { status: 400 });
    } catch (e) {
      console.error('[cdn] unhandled', e);
      return response503();
    }
  },
};
