import { ProductLink, signRequest, sha256hex, checkUsage, checkHeartbeat, VERSION, type Health, type UsageEvent } from '@core/product-link';
import { createAdminClient } from '@/lib/supabase/admin';
import pkg from '../../package.json';

/**
 * Phase 2a — NuraWell ↔ parent platform link in SHADOW mode (platform-core product-link).
 * Triggered by central every 15 min (POST /api/v1/central/link-tick, per-product bearer). Never runs on a user request,
 * never touches Almog, sign-in or onboarding code paths, and can never block or change anyone's access.
 * Heartbeat is sent every tick. Daily usage + shadow decisions are idempotent at the parent, so the heavy
 * collect/listUsers/license-status work runs only in the first 15 minutes of each UTC hour (one heavy tick
 * per hour at a 15-min cadence, with an hourly retry if that tick failed). Override with LINK_TICK_HEAVY=1/0.
 * Sends ONLY: version + health, yesterday's daily counts (no ids, names, emails or text), and one shadow license
 * decision per existing user (by license id only) so central can show what enforcement WOULD do.
 * Missing env ⇒ 'skipped'. Never throws.
 */
const PRODUCT_ID = 'nurawell';
const DAY_MS = 86_400_000;
const MAX_COUNT = 1_000_000;
/** Public key of central's signed license-status list (platform-core packages/customers-licensing/keys). Public, not a secret. */
const STATUS_PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: 'BBkaKRyCVQGtBwmLHmXFF0FnX-5LQZayAbZIjW3stvw', y: 'X_ed_4mON3I-7bSob8rreWnP48DldEZNTPNc1fBI1KM' } as const;

type Env = Record<string, string | undefined>;
type AiRow = { feature: string | null; prompt_tokens: number | null; completion_tokens: number | null; cost_usd: number | string | null };
type CountResult = PromiseLike<{ count: number | null; error: unknown }>;
export interface DailyCounts { day: string; metrics: Record<string, number> }
export interface TickResult { status: 'sent' | 'skipped'; heartbeat: number; usage: number; decisions: number[]; health: Health; version: string; heavy: boolean }

/** Almog = the chat features (reply, router, titles, summaries, QC). Read-only accounting from ai_usage_events. */
// skipcq: JS-0067 -- ES module export, not a global
export function isAlmogFeature(feature: string | null | undefined): boolean {
  if (!feature) return false;
  return feature === 'chat' || feature.startsWith('chat_') || feature.startsWith('almog');
}

// skipcq: JS-0067 -- ES module export, not a global
export function linkVersion(env: Env = process.env): string {
  const shortSha = (env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
  const version = /^[0-9a-f]{7}$/.test(shortSha) ? `${pkg.version}+${shortSha}` : pkg.version;
  return VERSION.test(version) ? version : '0.0.0';
}

/** Daily usage + shadow work is idempotent at the parent; repeating it every 15 min burns Fluid Active CPU. */
// skipcq: JS-0067 -- ES module export, not a global
export function shouldRunHeavyLinkTick(nowMs: number, env: Env = process.env): boolean {
  const flag = (env.LINK_TICK_HEAVY ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'always' || flag === 'true') return true;
  if (flag === '0' || flag === 'never' || flag === 'false') return false;
  return new Date(nowMs).getUTCMinutes() < 15;
}


/** Stable event id per (day, metric): a re-send of the same day is ignored by central (idempotent). */
// skipcq: JS-0067 -- ES module export, not a global
export async function eventId(day: string, metric: string): Promise<string> {
  const hash = await sha256hex(`${PRODUCT_ID}|${day}|${metric}`);
  const variant = '89ab'[parseInt(hash[16] ?? '0', 16) % 4];
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const clampCount = (value: number): number => {
  return Math.min(MAX_COUNT, Math.max(0, Math.round(value)));
}

const countOrThrow = async (query: CountResult): Promise<number> => {
  const result = await query;
  if (result.error) throw new Error('db');
  return result.count ?? 0;
}

/** Adds AI totals (all features) and the Almog subset. Cost is sent in 1/100,000 USD so it stays an integer. */
// skipcq: JS-R1005 -- simple numeric fallbacks per field
const addAiTotals = (metrics: Record<string, number>, rows: AiRow[]): void => {
  const add = (key: string, amount: number) => { metrics[key] = (metrics[key] ?? 0) + amount; };
  for (const row of rows) {
    const tokensIn = Number(row.prompt_tokens) || 0;
    const tokensOut = Number(row.completion_tokens) || 0;
    const cost = Number(row.cost_usd) || 0;
    const prefixes = isAlmogFeature(row.feature) ? ['ai', 'almog'] : ['ai'];
    for (const prefix of prefixes) {
      add(`${prefix}.calls`, 1);
      add(`${prefix}.tokens_in`, tokensIn);
      add(`${prefix}.tokens_out`, tokensOut);
      add(`${prefix}.cost_usd_e5`, cost * 100_000);
    }
  }
}

/** Yesterday's (UTC) totals. Counts only. Returns null when the DB is unreachable. */
// skipcq: JS-0067 -- ES module export, not a global
export async function collectDaily(nowMs = Date.now()): Promise<DailyCounts | null> {
  const dayEnd = new Date(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  const from = new Date(dayEnd.getTime() - DAY_MS).toISOString();
  const until = dayEnd.toISOString();
  try {
    const db = createAdminClient();
    const [active, signups, errors, ai] = await Promise.all([
      countOrThrow(db.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active_at', from).lt('last_active_at', until)),
      countOrThrow(db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', until)),
      countOrThrow(db.from('error_events').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', until).in('severity', ['error', 'fatal'])),
      db.from('ai_usage_events').select('feature, prompt_tokens, completion_tokens, cost_usd').gte('created_at', from).lt('created_at', until).limit(20_000),
    ]);
    if (ai.error) throw new Error('db');
    const metrics: Record<string, number> = { 'users.active': active, 'users.signups': signups, 'errors.server': errors };
    addAiTotals(metrics, (ai.data ?? []) as AiRow[]);
    return { day: from.slice(0, 10), metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, clampCount(value)])) };
  } catch {
    return null;
  }
}

/** License ids (app_metadata.pl_lic, server-written) of existing users with app access today. Null on any DB error. */
const activeUserLics = async (): Promise<Array<string | null> | null> => {
  try {
    const db = createAdminClient();
    const result = await db.from('profiles').select('id').eq('is_active', true).limit(5000);
    if (result.error) return null;
    const active = new Set((result.data ?? []).map((r: { id: string }) => r.id));
    const lics = new Map<string, string | null>();
    for (let page = 1; page <= 20 && lics.size < active.size; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return null;
      for (const u of data.users) if (active.has(u.id)) lics.set(u.id, typeof u.app_metadata?.pl_lic === 'string' ? u.app_metadata.pl_lic : null);
      if (data.users.length < 1000) break;
    }
    return [...active].map(id => lics.get(id) ?? null);
  } catch {
    return null;
  }
}

const usageEvents = async (daily: DailyCounts, wouldBlock: number | null): Promise<UsageEvent[]> => {
  const metrics = wouldBlock ? { ...daily.metrics, 'shadow.would_block': clampCount(wouldBlock) } : daily.metrics;
  const events: UsageEvent[] = [];
  for (const [metric, amount] of Object.entries(metrics)) {
    if (amount >= 1) events.push({ id: await eventId(daily.day, metric), metric, n: amount, day: daily.day });
  }
  return events;
}

/** Shadow license check per existing user (by license id only; no user ids leave NuraWell). Never blocks. */
const shadowDecision = async (link: { base: string; keyId: string; secret: string; version: string }, fetchImpl: typeof fetch, nowMs: number, lics: Array<string | null> | null): Promise<{ decisions: number[]; wouldBlock: number | null }> => {
  try {
    const publicKey = await crypto.subtle.importKey('jwk', STATUS_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const client = new ProductLink({
      productId: PRODUCT_ID, keyId: link.keyId, secret: link.secret, version: link.version, instance: 'web', mode: 'shadow',
      endpoint: `${link.base}/functions/v1/product-link`, statusUrl: `${link.base}/functions/v1/admin-api/license-status`,
      publicKey, fetch: fetchImpl, now: () => nowMs,
    });
    let wouldBlock = 0, outage = false;
    for (const lic of (lics ?? [null]).slice(0, 500)) {
      const verdict = await client.check('*', { lic });
      if (verdict.reason === 'no_status' || verdict.reason === 'stale_status') outage = true; // enforcement fails open here
      else if (verdict.wouldBlock) wouldBlock += 1;
    }
    return { decisions: (await client.flush(true)).decisions, wouldBlock: lics && !outage ? wouldBlock : null };
  } catch {
    return { decisions: [0], wouldBlock: null };
  }
}

type LinkConf = { base: string; keyId: string; secret: string };

const asText = (value: string | undefined): string => value ?? '';

const trimSlash = (url: string | undefined): string => asText(url).replace(/\/$/, '');

const isLinkConf = (conf: LinkConf): boolean => [conf.base.startsWith('https://'), conf.keyId !== '', conf.secret !== ''].every(Boolean);

const readLinkConf = (env: Env): LinkConf | null => {
  const conf = { base: trimSlash(env.CENTRAL_SUPABASE_URL), keyId: asText(env.PRODUCT_LINK_KEY_ID), secret: asText(env.PRODUCT_LINK_SECRET) };
  return isLinkConf(conf) ? conf : null;
};

const makePoster = (conf: LinkConf, fetchImpl: typeof fetch, nowMs: number) => async (path: string, payload: unknown): Promise<number> => {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const signed = await signRequest(conf.keyId, conf.secret, path, bytes, nowMs);
    const response = await fetchImpl(`${conf.base}/functions/v1/product-link${path}`, {
      method: 'POST', body: bytes, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...signed },
    });
    await response.body?.cancel().catch(() => null);
    return response.status;
  } catch {
    return 0;
  }
};

const sendUsage = async (
  daily: Awaited<ReturnType<typeof collectDaily>>, users: number | null,
  post: (path: string, payload: unknown) => Promise<number>, nowMs: number,
): Promise<number> => {
  if (!daily) return 0;
  const events = await usageEvents(daily, users);
  if (!events.length) return 204;
  return checkUsage({ events }, nowMs).ok ? post('/v1/usage', { events }) : 422;
};

const SKIPPED_BASE = { status: 'skipped', heartbeat: 0, usage: 0, decisions: [], health: 'ok', heavy: false } as const;

const tickHealth = (daily: unknown, users: unknown): Health => ([daily, users].includes(null) ? 'degraded' : 'ok');

const sendHeartbeat = (beat: { instance: string; version: string; health: Health }, post: (path: string, payload: unknown) => Promise<number>): Promise<number> =>
  (checkHeartbeat(beat).ok ? post('/v1/heartbeat', beat) : Promise.resolve(422));

// skipcq: JS-0067 -- ES module export
export async function runLinkTick(env: Env, fetchImpl: typeof fetch, nowMs: number): Promise<TickResult> {
  const version = linkVersion(env);
  const conf = readLinkConf(env);
  if (!conf) return { ...SKIPPED_BASE, decisions: [], version };
  const post = makePoster(conf, fetchImpl, nowMs);
  const heavy = shouldRunHeavyLinkTick(nowMs, env);
  if (!heavy) {
    const heartbeat = await sendHeartbeat({ instance: 'web', version, health: 'ok' }, post);
    return { status: 'sent', heartbeat, usage: 0, decisions: [], health: 'ok', version, heavy: false };
  }
  const daily = await collectDaily(nowMs);
  const lics = await activeUserLics();
  const health = tickHealth(daily, lics);
  const heartbeat = await sendHeartbeat({ instance: 'web', version, health }, post);
  const shadow = await shadowDecision({ ...conf, version }, fetchImpl, nowMs, lics);
  const usage = await sendUsage(daily, shadow.wouldBlock, post, nowMs);
  const decisions = shadow.decisions;
  return { status: 'sent', heartbeat, usage, decisions, health, version, heavy: true };
}
