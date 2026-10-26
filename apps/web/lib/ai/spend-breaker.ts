/**
 * Daily AI spend circuit breaker (OpenRouter).
 * Background work (crons, batch, notifications, QC, Gideon) stops for the rest of the UTC day once
 * today's metered spend passes AI_DAILY_BACKGROUND_CAP_USD (default $0.50). Almog's live chat is never
 * blocked by this, only by AI_DAILY_HARD_CAP_USD (default $5), so a real user is not cut off by a batch job.
 * A tripped call gets a synthetic 429, which every caller already treats as "provider unavailable".
 * One owner alert per UTC day per level. Fails open: if the spend cannot be read, nothing is blocked.
 */
const INTERACTIVE = /^(chat|chat_router|chat_session_title|embeddings|journey_next_step)$/;

export function isInteractiveFeature(feature: string | null | undefined): boolean {
  return !!feature && INTERACTIVE.test(feature);
}

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}
export function caps() {
  return { background: num(process.env.AI_DAILY_BACKGROUND_CAP_USD, 0.5), hard: num(process.env.AI_DAILY_HARD_CAP_USD, 5) };
}

let cache: { day: string; usd: number; at: number } | null = null;
const alerted = new Set<string>();
const TTL = 60_000;

export function _resetBreaker() {
  cache = null;
  alerted.clear();
}

async function todaySpend(day: string): Promise<number | null> {
  if (cache && cache.day === day && Date.now() - cache.at < TTL) return cache.usd;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/ai_usage_events?select=cost_usd&created_at=gte.${day}T00:00:00Z&limit=20000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'User-Agent': 'NuraWell-Server/spend-breaker/1' },
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as { cost_usd: number | string | null }[];
    const usd = rows.reduce((s, x) => s + (Number(x.cost_usd) || 0), 0);
    cache = { day, usd, at: Date.now() };
    return usd;
  } catch {
    return null;
  }
}

/** Add a just-recorded cost to the cached total so the breaker reacts within one TTL. */
export function noteSpend(usd: number) {
  if (cache && cache.day === new Date().toISOString().slice(0, 10)) cache.usd += usd;
}

async function alertOnce(level: string, day: string, usd: number, cap: number) {
  const k = `${day}:${level}`;
  if (alerted.has(k)) return;
  alerted.add(k);
  try {
    const { alertOwner } = await import('@/lib/ceo/stepup-http');
    await alertOwner(`⚠️ עצירת עלויות AI (${level === 'hard' ? 'כולל צ\'אט' : 'משימות רקע'}): היום נוצלו $${usd.toFixed(2)} מתוך תקרה של $${cap.toFixed(2)}. ההפעלה תחזור מחר (UTC).`);
  } catch {
    /* alert is best-effort */
  }
}

/** Returns a 429 Response when the call must be blocked, else null. */
export async function checkSpendBreaker(feature: string | null | undefined): Promise<Response | null> {
  if (process.env.AI_SPEND_BREAKER === 'off') return null;
  const day = new Date().toISOString().slice(0, 10);
  const usd = await todaySpend(day);
  if (usd === null) return null;
  const { background, hard } = caps();
  const level = usd >= hard ? 'hard' : !isInteractiveFeature(feature) && usd >= background ? 'background' : null;
  if (!level) return null;
  console.warn('[spend-breaker] blocked AI call', { feature: feature ?? null, level, usd: Number(usd.toFixed(4)) });
  void alertOnce(level, day, usd, level === 'hard' ? hard : background);
  return new Response(JSON.stringify({ error: { message: 'daily AI spend cap reached', code: 429 } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '3600' } });
}
