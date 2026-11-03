import { ProductLink, signRequest, sha256hex, checkUsage, checkHeartbeat, VERSION, type Health, type UsageEvent } from '@core/product-link';
import { createAdminClient } from '@/lib/supabase/admin';
import pkg from '../../package.json';

/**
 * Phase 2a — NuraWell ↔ parent platform link in SHADOW mode (platform-core product-link).
 * Triggered by central every 15 min (POST /api/v1/central/link-tick, per-product bearer). Never runs on a user request,
 * never touches Almog, sign-in or onboarding code paths, and can never block or change anyone's access.
 * Sends ONLY: version + health, yesterday's daily counts (no ids, names, emails or text), and one shadow license
 * decision ("an existing user with no parent license") so central can show what enforcement WOULD do.
 * Missing env ⇒ 'skipped'. Never throws.
 */
const PRODUCT = 'nurawell';
/** Public key of central's signed license-status list (platform-core packages/customers-licensing/keys). Public, not a secret. */
const STATUS_PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: 'BBkaKRyCVQGtBwmLHmXFF0FnX-5LQZayAbZIjW3stvw', y: 'X_ed_4mON3I-7bSob8rreWnP48DldEZNTPNc1fBI1KM' } as const;
/** Almog = the chat features (reply, router, titles, summaries, QC). Read-only accounting from ai_usage_events. */
export const isAlmogFeature = (f: string | null | undefined) => !!f && (f === 'chat' || f.startsWith('chat_') || f.startsWith('almog'));

export function linkVersion(env: Record<string, string | undefined> = process.env): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
  const v = /^[0-9a-f]{7}$/.test(sha) ? `${pkg.version}+${sha}` : pkg.version;
  return VERSION.test(v) ? v : '0.0.0';
}

/** Stable event id per (day, metric): a re-send of the same day is ignored by central (idempotent). */
export async function eventId(day: string, metric: string): Promise<string> {
  const h = await sha256hex(`${PRODUCT}|${day}|${metric}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16] ?? '0', 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const clamp = (n: number) => Math.min(1_000_000, Math.max(0, Math.round(n)));
type Row = { feature: string | null; prompt_tokens: number | null; completion_tokens: number | null; cost_usd: number | string | null };

/** Yesterday's (UTC) totals. Counts only. Returns null when the DB is unreachable. */
export async function collectDaily(now = Date.now()): Promise<{ day: string; metrics: Record<string, number> } | null> {
  const end = new Date(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z'), start = new Date(end.getTime() - 86_400_000);
  const s = start.toISOString(), e = end.toISOString(), db = createAdminClient();
  const cnt = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await q; if (r.error) throw new Error('db'); return r.count ?? 0; };
  try {
    const [active, signups, errors, ai] = await Promise.all([
      cnt(db.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active_at', s).lt('last_active_at', e)),
      cnt(db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', s).lt('created_at', e)),
      cnt(db.from('error_events').select('id', { count: 'exact', head: true }).gte('created_at', s).lt('created_at', e).in('severity', ['error', 'fatal'])),
      db.from('ai_usage_events').select('feature, prompt_tokens, completion_tokens, cost_usd').gte('created_at', s).lt('created_at', e).limit(20_000),
    ]);
    if (ai.error) throw new Error('db');
    const m: Record<string, number> = { 'users.active': active, 'users.signups': signups, 'errors.server': errors };
    const add = (k: string, n: number) => { m[k] = (m[k] ?? 0) + n; };
    for (const r of (ai.data ?? []) as Row[]) {
      const tin = Number(r.prompt_tokens) || 0, tout = Number(r.completion_tokens) || 0, c = Number(r.cost_usd) || 0;
      for (const p of isAlmogFeature(r.feature) ? ['ai', 'almog'] : ['ai']) { add(`${p}.calls`, 1); add(`${p}.tokens_in`, tin); add(`${p}.tokens_out`, tout); add(`${p}.cost_usd_e5`, c * 100_000); }
    }
    return { day: s.slice(0, 10), metrics: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, clamp(v)])) };
  } catch { return null; }
}

/** Existing users with app access today. Used only for the shadow "would block" count. */
async function activeUsers(): Promise<number | null> {
  try { const r = await createAdminClient().from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true); return r.error ? null : r.count ?? 0; } catch { return null; }
}

export interface TickResult { status: 'sent' | 'skipped'; heartbeat: number; usage: number; decisions: number[]; health: Health; version: string }

export async function runLinkTick(env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch, now = Date.now()): Promise<TickResult> {
  const version = linkVersion(env), base = env.CENTRAL_SUPABASE_URL?.replace(/\/$/, ''), keyId = env.PRODUCT_LINK_KEY_ID, secret = env.PRODUCT_LINK_SECRET;
  if (!base || !/^https:\/\//.test(base) || !keyId || !secret) return { status: 'skipped', heartbeat: 0, usage: 0, decisions: [], health: 'ok', version };
  const endpoint = `${base}/functions/v1/product-link`;
  const post = async (path: string, body: unknown) => {
    try {
      const b = new TextEncoder().encode(JSON.stringify(body));
      const r = await f(`${endpoint}${path}`, { method: 'POST', body: b, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(await signRequest(keyId, secret, path, b, now)) } });
      await r.body?.cancel().catch(() => null); return r.status;
    } catch { return 0; }
  };
  const daily = await collectDaily(now), users = await activeUsers();
  const health: Health = daily === null || users === null ? 'degraded' : 'ok';
  const hb = { instance: 'web', version, health };
  const heartbeat = checkHeartbeat(hb).ok ? await post('/v1/heartbeat', hb) : 422;
  let usage = 0;
  if (daily) {
    const metrics = { ...daily.metrics, ...(users ? { 'shadow.would_block': clamp(users) } : {}) };
    const events: UsageEvent[] = [];
    for (const [metric, n] of Object.entries(metrics)) if (n >= 1) events.push({ id: await eventId(daily.day, metric), metric, n, day: daily.day });
    usage = !events.length ? 204 : checkUsage({ events }, now).ok ? await post('/v1/usage', { events }) : 422;
  }
  // Shadow license check: logs what enforcement WOULD decide for an existing NuraWell user (no parent license yet). Never blocks.
  let decisions: number[] = [];
  try {
    const publicKey = await crypto.subtle.importKey('jwk', STATUS_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const link = new ProductLink({ productId: PRODUCT, keyId, secret, version, instance: 'web', endpoint, statusUrl: `${base}/functions/v1/admin-api/license-status`, publicKey, fetch: f, now: () => now, mode: 'shadow' });
    await link.check('*', { lic: null });
    decisions = (await link.flush(true)).decisions;
  } catch { decisions = [0]; }
  return { status: 'sent', heartbeat, usage, decisions, health, version };
}
