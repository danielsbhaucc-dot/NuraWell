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
async function checkUpstashRedis(input: RateLimitInput, now: number): Promise<RateLimitResult | null> {
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
    // Redis down → fail over to Postgres/memory instead of blocking all traffic.
    return null;
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

// skipcq: JS-0067, JS-R1005 -- module-scoped (ES module)
function supabaseRest(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || process.env.RATE_LIMIT_BACKEND === 'memory') return null;
  return { url, key };
}

/**
 * Postgres-backed distributed limiter (atomic upsert in `rate_limit_consume`).
 * Keys are hashed in the DB — no raw IP/user ids stored. Falls back to memory on error.
 */
// skipcq: JS-0067, JS-R1005 -- module-scoped (ES module)
async function checkPostgres(
  input: RateLimitInput,
  now: number,
  cfg: { url: string; key: string }
): Promise<RateLimitResult | null> {
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/rate_limit_consume`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: `${input.namespace}:${input.key}`, p_window_seconds: input.windowSeconds }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ hits: number; reset_at: string }> | null;
    const row = rows?.[0];
    if (!row || typeof row.hits !== 'number') return null;
    return {
      ok: row.hits <= input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - row.hits),
      resetAt: Date.parse(row.reset_at) || now + input.windowSeconds * 1000,
    };
  } catch {
    return null;
  }
}

const loggedHits = new Map<string, number>();

/** Best-effort audit entry (admin_audit_log, method SECURITY) — once per namespace+key per window. */
// skipcq: JS-0067, JS-R1005 -- module-scoped (ES module)
async function logLimitHit(input: RateLimitInput, result: RateLimitResult): Promise<void> {
  const cfg = supabaseRest();
  if (!cfg) return;
  const k = `${input.namespace}:${input.key}`;
  if ((loggedHits.get(k) ?? 0) >= result.resetAt) return;
  loggedHits.set(k, result.resetAt);
  if (loggedHits.size > 5000) loggedHits.clear();
  try {
    const data = new TextEncoder().encode(`rl:${k}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const keyTag = Array.from(new Uint8Array(digest)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
    await fetch(`${cfg.url}/rest/v1/admin_audit_log`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        method: 'SECURITY',
        path: 'rate_limited',
        detail: { namespace: input.namespace, limit: input.limit, window_s: input.windowSeconds, key_tag: keyTag },
      }),
      cache: 'no-store',
    });
  } catch {
    /* never throw from logging */
  }
}

// skipcq: JS-0067, JS-R1005 -- module-scoped (ES module)
async function consumeRaw(input: RateLimitInput, now: number): Promise<RateLimitResult> {
  if (isUpstashRedisConfigured()) {
    const redisResult = await checkUpstashRedis(input, now);
    if (redisResult) return redisResult;
    void logFallback('redis', input.namespace, now);
  }
  const cfg = supabaseRest();
  if (cfg) {
    const pgResult = await checkPostgres(input, now, cfg);
    if (pgResult) return pgResult;
    void logFallback('postgres', input.namespace, now);
  }
  return checkMemory(input, now);
}

const FALLBACK_LOG_INTERVAL_MS = 5 * 60_000;
const FALLBACK_SPIKE_THRESHOLD = 50;
const fallbackState = { windowStart: 0, count: 0, lastLoggedAt: 0, spikeLogged: false };

/**
 * Distributed limiter failed and we degraded. Throttled audit entry (≤1 per 5 min per
 * instance) so it is visible in the security log; a separate high-severity alert when
 * failures spike inside one window.
 */
// skipcq: JS-0067, JS-R1005 -- module-scoped (ES module)
async function logFallback(backend: 'redis' | 'postgres', namespace: string, now: number): Promise<void> {
  if (now - fallbackState.windowStart > FALLBACK_LOG_INTERVAL_MS) {
    fallbackState.windowStart = now;
    fallbackState.count = 0;
    fallbackState.spikeLogged = false;
  }
  fallbackState.count += 1;
  const spike = fallbackState.count >= FALLBACK_SPIKE_THRESHOLD && !fallbackState.spikeLogged;
  const due = now - fallbackState.lastLoggedAt >= FALLBACK_LOG_INTERVAL_MS;
  if (!spike && !due) return;
  if (spike) fallbackState.spikeLogged = true;
  fallbackState.lastLoggedAt = now;
  const cfg = supabaseRest();
  if (!cfg) return;
  try {
    await fetch(`${cfg.url}/rest/v1/admin_audit_log`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        method: 'SECURITY',
        path: spike ? 'rate_limit_fallback_spike' : 'rate_limit_fallback',
        detail: { backend, namespace, failures_in_window: fallbackState.count, severity: spike ? 'high' : 'medium' },
      }),
      cache: 'no-store',
    });
  } catch {
    /* never throw from logging */
  }
}

// skipcq: JS-0067 -- ES module export
export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const now = Date.now();
  const result = await consumeRaw(input, now);
  if (!result.ok) await logLimitHit(input, result);
  return result;
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
