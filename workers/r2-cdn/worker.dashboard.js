/**
 * גרסת JavaScript להדבקה ידנית ב-Cloudflare Dashboard (Quick Edit → worker.js).
 * אל תדביק את src/index.ts — יש בו TypeScript שגורם ל-SyntaxError בשורה 12.
 *
 * Bindings נדרשים:
 *   MAIN_BUCKET  → דלי תמונות
 *   FILES_BUCKET → דלי קבצים
 *   AUDIO_BUCKET → nurawell-audio
 */

const IMAGE_EXTENSIONS_CACHE = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'ico',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'webm',
]);

const AUDIO_CONTENT_TYPES = {
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

function extname(path) {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

function shouldUseEdgeCache(pathname, routeLabel) {
  const ext = extname(pathname);
  if (routeLabel === 'audio') return AUDIO_EXTENSIONS.has(ext);
  return IMAGE_EXTENSIONS_CACHE.has(ext);
}

function browserCacheControl(pathname, routeLabel) {
  const ext = extname(pathname);
  if (routeLabel === 'audio') {
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

function keyFromPath(prefix, pathname) {
  const raw = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function isForbiddenKey(key) {
  if (!key || key.startsWith('/')) return true;
  for (const seg of key.split('/')) {
    if (seg === '..') return true;
  }
  return false;
}

function logLine(request, phase, detail) {
  const url = new URL(request.url);
  console.log(
    `[cdn] ${request.method} ${url.pathname} → ${phase}${detail ? ` ${detail}` : ''}`
  );
}

function parseRangeHeader(header) {
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

async function r2GetSafe(bucket, key, options) {
  try {
    return await bucket.get(key, options);
  } catch (e) {
    console.error('[cdn] R2 error', key, e);
    throw e;
  }
}

function response503() {
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

function baseHeaders(object, pathname, routeLabel) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (!headers.get('Content-Type')) {
    if (routeLabel === 'audio') {
      headers.set('Content-Type', AUDIO_CONTENT_TYPES[extname(pathname)] ?? 'audio/mpeg');
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

async function serveRangedAudio(params) {
  const { bucket, key, request, routeLabel, pathname, parsedRange } = params;

  let object;
  try {
    object = await r2GetSafe(bucket, key, { range: parsedRange });
  } catch {
    return response503();
  }

  if (!object) {
    logLine(request, 'R2', `${routeLabel} 404`);
    return new Response('Object Not Found', { status: 404 });
  }

  const total = object.size;
  let start;
  let end;
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

  const headers = baseHeaders(object, pathname, routeLabel);
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  headers.set('Content-Length', String(end - start + 1));

  const isHead = request.method === 'HEAD';
  const body = isHead ? null : object.body;

  logLine(request, 'R2', `${routeLabel} 206`);
  return new Response(body, { status: 206, headers });
}

async function serveFromBucket(params) {
  const { bucket, key, request, ctx, routeLabel, pathname, tryEdgeCache, supportRange } = params;

  if (isForbiddenKey(key)) {
    return new Response('Access Denied', { status: 403 });
  }

  const isGet = request.method === 'GET';
  const isHead = request.method === 'HEAD';

  const parsedRange = supportRange ? parseRangeHeader(request.headers.get('Range')) : null;

  if (parsedRange) {
    return serveRangedAudio({ bucket, key, request, routeLabel, pathname, parsedRange });
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

  let object;
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

  const objectBody = object.body ?? null;
  const body = isHead ? null : objectBody;
  const response = new Response(body, { status: 200, headers });

  if (useCacheApi && objectBody) {
    ctx.waitUntil(cache.put(cacheRequest, response.clone()));
  }

  return response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '') {
      return new Response('Access Denied', { status: 403 });
    }

    let pathname = path;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    try {
      if (pathname.startsWith('/images/')) {
        const key = keyFromPath('/images/', pathname);
        if (!key) return new Response('Object Not Found', { status: 404 });
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
        const key = keyFromPath('/files/', pathname);
        if (!key) return new Response('Object Not Found', { status: 404 });
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
        const key = keyFromPath('/audio/', pathname);
        if (!key) return new Response('Object Not Found', { status: 404 });
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

      return new Response('Invalid Path. Use /images/, /files/ or /audio/', { status: 400 });
    } catch (e) {
      console.error('[cdn] unhandled', e);
      return response503();
    }
  },
};
