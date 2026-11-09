import 'server-only';
import { signRequest } from '@core/product-link';

/**
 * Stage 2 — least-privilege access to the central control plane.
 * NuraWell no longer holds the central service-role key at runtime. Every control-plane call (module states, one-time
 * sync, module on/off, hub snapshot, licence store, metrics feed) goes to the parent's product-link function as a
 * signed POST /v1/central { fn, args } with NuraWell's own product-link key (HMAC + timestamp + nonce). The parent pins
 * every call to product "nurawell", allows only a fixed list of functions, checks licence ownership and filters the
 * snapshot to NuraWell's own rows (platform-core db/functions/product-link/central-scope.ts).
 * Same `rpc(fn, args)` shape as a Supabase client, so the shared module-library code stays unchanged.
 */
type Env = Record<string, string | undefined>;
export type CentralRpcResult = { data: unknown; error: { message: string } | null };
export type CentralRpc = { rpc(fn: string, args?: Record<string, unknown>): Promise<CentralRpcResult> };

const PATH = '/v1/central';

function linkConf(env: Env) {
  const base = (env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, ''), keyId = env.PRODUCT_LINK_KEY_ID ?? '', secret = env.PRODUCT_LINK_SECRET ?? '';
  return base.startsWith('https://') && keyId && secret ? { base, keyId, secret } : null;
}

/** Central reachable through product-link (URL + product-link key id + secret). Replaces the old service-key check. */
export function centralLinkConfigured(env: Env = process.env): boolean {
  return linkConf(env) !== null;
}

export function createCentralLinkClient(env: Env = process.env, fetchImpl: typeof fetch = fetch): CentralRpc {
  return {
    async rpc(fn, args = {}) {
      const conf = linkConf(env);
      if (!conf) return { data: null, error: { message: 'central_not_configured' } };
      try {
        const bytes = new TextEncoder().encode(JSON.stringify({ fn, args }));
        const signed = await signRequest(conf.keyId, conf.secret, PATH, bytes, Date.now());
        const r = await fetchImpl(`${conf.base}/functions/v1/product-link${PATH}`, {
          method: 'POST', body: bytes, signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', ...signed }, cache: 'no-store',
        });
        const j = (await r.json().catch(() => null)) as { data?: unknown; error?: string } | null;
        if (!r.ok) return { data: null, error: { message: typeof j?.error === 'string' ? j.error.slice(0, 64) : `http_${r.status}` } };
        return { data: j?.data ?? null, error: null };
      } catch {
        return { data: null, error: { message: 'central_unavailable' } };
      }
    },
  };
}

type SecurityResult = 'sent' | 'skipped' | 'failed';
type SecurityStatus = import('@core/security-privacy/feed').SecurityStatus;

/**
 * Security events and the daily security status for the parent console, over the same signed bridge
 * (central_ingest_security). Replaces the kit's direct sender, which needed the central service key.
 * Same opt-in as the kit (KIT_CENTRAL_REPORTING=on) and the same HMAC body signature; never throws.
 */
async function sendSecurity(body: object, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<SecurityResult> {
  const secret = env.CENTRAL_METRICS_FEED_SECRET;
  if (env.KIT_CENTRAL_REPORTING !== 'on' || !secret || !centralLinkConfigured(env)) return 'skipped';
  try {
    const { signSecurityBody } = await import('@core/security-privacy/feed');
    const payload = JSON.stringify(body), { ts, nonce, sig } = signSecurityBody(secret, payload);
    const r = await createCentralLinkClient(env, fetchImpl).rpc('central_ingest_security', { p_body: payload, p_ts: ts, p_nonce: nonce, p_sig: sig });
    return r.error ? 'failed' : 'sent';
  } catch { return 'failed'; }
}

const lastEvent = new Map<string, { at: number; n: number }>();
/** One security event (short code, no user data). Throttled per kind like the kit: at most one send per `everyMs`; skipped hits are counted into the next send. */
export function sendCentralSecurityEvent(kind: string, severity: 'low' | 'medium' | 'high' | 'critical', everyMs = 600_000, env?: Env, fetchImpl?: typeof fetch): Promise<SecurityResult | 'throttled'> {
  if (!/^[a-z0-9_]{1,40}$/.test(kind)) return Promise.resolve('skipped');
  const now = Date.now(), prev = lastEvent.get(kind);
  if (prev && now - prev.at < everyMs) { prev.n += 1; return Promise.resolve('throttled'); }
  const n = (prev?.n ?? 0) + 1; lastEvent.set(kind, { at: now, n: 0 });
  return sendSecurity({ type: 'event', kind, severity, n }, env, fetchImpl);
}

export function sendCentralSecurityStatus(status: SecurityStatus, env?: Env, fetchImpl?: typeof fetch): Promise<SecurityResult> {
  return sendSecurity({ type: 'status', status }, env, fetchImpl);
}
