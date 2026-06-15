/**
 * Rate limiting לכל route שצריך — בעיקר `/api/v1/ai/chat` כדי שמשתמש (או באג
 * בלקוח שלולא בלולאה) לא ישרוף את קרדיט ה-OpenRouter בעלות של דקות.
 *
 * אסטרטגיה:
 *  - אם הוגדרו `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash Redis,
 *    שאפשר להוסיף בלי outside-of-stack ל-Upstash שכבר משמש ל-QStash/Vector) →
 *    שולחים פקודות INCR+EXPIRE דרך REST. מבוזר בין כל instances של Vercel Edge.
 *  - בלי env: fallback לזיכרון של ה-instance הנוכחי (per-region / per-cold-start).
 *    זה לא מבוזר, אבל עדיין חוסם לולאות אגרסיביות בצד הלקוח שדוחפות אלפי בקשות
 *    בדקה — האיום הקריטי המעשי. כשמוסיפים Upstash Redis, האכיפה אוטומטית מתחזקת.
 *
 * Edge-friendly: בלי תלות ב-Node API. השימוש ב-REST של Upstash מתאים גם ל-edge.
 */

const memoryWindows = new Map<string, { count: number; resetAt: number }>();

let lastMemoryCleanupAt = 0;
const MEMORY_CLEANUP_INTERVAL_MS = 60_000;

function gcMemoryWindows(now: number) {
  if (now - lastMemoryCleanupAt < MEMORY_CLEANUP_INTERVAL_MS) return;
  lastMemoryCleanupAt = now;
  for (const [key, entry] of memoryWindows.entries()) {
    if (entry.resetAt <= now) memoryWindows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** המספר המקסימלי שהוגדר לחלון */
  limit: number;
  /** מספר הבקשות שנותרו (לאחר הבקשה הנוכחית) */
  remaining: number;
  /** מתי החלון הנוכחי מתאפס (epoch ms) */
  resetAt: number;
};

type RateLimitInput = {
  /** מזהה ייחודי של בקשה (לרוב userId) */
  key: string;
  /** מקסימום בקשות לחלון */
  limit: number;
  /** אורך החלון בשניות (fixed-window) */
  windowSeconds: number;
  /** namespace לוגי, כדי לא להתנגש בין routes שונים */
  namespace: string;
};

function isUpstashRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

/**
 * INCR+EXPIRE atomic לתוך Upstash Redis REST. שורד restart של edge instance ומכסה
 * את כל ה-instances ביחד.
 */
async function checkUpstashRedis(input: RateLimitInput, now: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const bucket = Math.floor(now / 1000 / input.windowSeconds);
  const redisKey = `rl:${input.namespace}:${input.key}:${bucket}`;
  const resetAt = (bucket + 1) * input.windowSeconds * 1000;

  /**
   * `pipeline` שולח קבוצת פקודות באטומיות-סבירה (לא transaction אמיתי אבל
   * מספיק טוב לחלון fixed window — אם אחת נפלה, השנייה לא תהרוס את הגישה).
   */
  const body = JSON.stringify([
    ['INCR', redisKey],
    ['EXPIRE', redisKey, String(input.windowSeconds + 5)],
  ]);

  let count = 0;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`upstash redis ${res.status}`);
    }
    const json = (await res.json()) as Array<{ result?: unknown; error?: string }> | null;
    const first = json?.[0];
    if (first && typeof first.result === 'number') {
      count = first.result;
    }
  } catch {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        limit: input.limit,
        remaining: 0,
        resetAt,
      };
    }
    return {
      ok: true,
      limit: input.limit,
      remaining: input.limit,
      resetAt,
    };
  }

  const remaining = Math.max(0, input.limit - count);
  return {
    ok: count <= input.limit,
    limit: input.limit,
    remaining,
    resetAt,
  };
}

function checkMemory(input: RateLimitInput, now: number): RateLimitResult {
  gcMemoryWindows(now);
  const mapKey = `${input.namespace}:${input.key}`;
  const existing = memoryWindows.get(mapKey);
  const windowMs = input.windowSeconds * 1000;

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    memoryWindows.set(mapKey, fresh);
    return {
      ok: true,
      limit: input.limit,
      remaining: input.limit - 1,
      resetAt: fresh.resetAt,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, input.limit - existing.count);
  return {
    ok: existing.count <= input.limit,
    limit: input.limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

let warnedMissingUpstashInProd = false;

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const now = Date.now();
  if (isUpstashRedisConfigured()) {
    return checkUpstashRedis(input, now);
  }
  // בפרודקשן ה-fallback לזיכרון הוא per-instance ולכן ניתן לעקיפה בין instances.
  // לא חוסמים (כדי לא לשבור פריסות ללא Redis), אבל מתריעים פעם אחת בלוג כדי
  // לחשוף את הצורך להגדיר UPSTASH_REDIS_REST_URL/TOKEN לאכיפה מבוזרת.
  if (process.env.NODE_ENV === 'production' && !warnedMissingUpstashInProd) {
    warnedMissingUpstashInProd = true;
    console.warn(
      '[rate-limit] Upstash Redis not configured in production — falling back to per-instance in-memory limiting, which is bypassable across serverless instances. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
    );
  }
  return checkMemory(input, now);
}

/**
 * עוטף בדיקת מספר חלונות (למשל קצר + ארוך) ומחזיר את התוצאה הראשונה שנכשלת.
 * שימוש: { short: { limit: 30, windowSeconds: 60 }, long: { limit: 200, windowSeconds: 3600 } }
 */
export async function consumeMultiRateLimits(
  key: string,
  namespace: string,
  windows: Array<{ limit: number; windowSeconds: number }>
): Promise<RateLimitResult> {
  let lastOk: RateLimitResult | null = null;
  for (const w of windows) {
    const r = await consumeRateLimit({
      key,
      namespace,
      limit: w.limit,
      windowSeconds: w.windowSeconds,
    });
    if (!r.ok) return r;
    lastOk = r;
  }
  return (
    lastOk ?? {
      ok: true,
      limit: 0,
      remaining: 0,
      resetAt: Date.now(),
    }
  );
}

/**
 * בונה תגובת 429 סטנדרטית עם כותרות `X-RateLimit-*` ו-`Retry-After`.
 */
export function rateLimitResponse(result: RateLimitResult, message?: string): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: message ?? 'יותר מדי בקשות. נסה שוב בעוד מספר שניות.',
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
        'Cache-Control': 'no-cache, no-transform',
      },
    }
  );
}
