/**
 * Drop-in product → parent ("head") feed client. One file, Node only, no dependencies.
 * Vendored from platform-core packages/product-connector/src/feed-client.ts — do not edit here; fix there and re-copy.
 * Never throws, never blocks the caller for more than 3 s, silently skips when env is missing.
 */
import { createHmac, randomBytes } from 'node:crypto';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export interface SecurityStatus { lockdown?: boolean | null; ipBlocksActive?: number | null; openIncidents?: number | null; denied24h?: number | null; loginFail24h?: number | null;
  events24h?: number | null; encOk?: boolean | null; lastAccessAudit?: string | null; accessAuditFlagged7d?: number | null }
type Result = 'sent' | 'skipped' | 'throttled' | 'failed';

const env = () => ({ product: process.env.CENTRAL_PRODUCT_ID, url: process.env.CENTRAL_SUPABASE_URL, key: process.env.CENTRAL_SUPABASE_SECRET_KEY, secret: process.env.CENTRAL_METRICS_FEED_SECRET });

export function signSecurityBody(secret: string, body: string, ts = Date.now(), nonce = randomBytes(16).toString('hex')) {
  return { ts: String(ts), nonce, sig: createHmac('sha256', secret).update(`sec.${ts}.${nonce}.${body}`).digest('hex') };
}

async function post(body: object): Promise<Result> {
  const e = env();
  if (!e.product || !e.url || !e.key || !e.secret) return 'skipped';
  try {
    const b = JSON.stringify(body), { ts, nonce, sig } = signSecurityBody(e.secret, b);
    const r = await fetch(`${e.url.replace(/\/$/, '')}/rest/v1/rpc/central_ingest_security`, {
      method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { apikey: e.key, authorization: `Bearer ${e.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_product: e.product, p_body: b, p_ts: ts, p_nonce: nonce, p_sig: sig }),
    });
    return r.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

const last = new Map<string, { at: number; n: number }>();
/** One security event (kind = short code, no user data). Throttled per kind: at most one send per `everyMs`; skipped hits are counted into the next send. */
export async function sendSecurityEvent(kind: string, severity: Severity, everyMs = 600_000): Promise<Result> {
  if (!/^[a-z0-9_]{1,40}$/.test(kind)) return 'skipped';
  const now = Date.now(), l = last.get(kind);
  if (l && now - l.at < everyMs) { l.n += 1; return 'throttled'; }
  const n = (l?.n ?? 0) + 1; last.set(kind, { at: now, n: 0 });
  return post({ type: 'event', kind, severity, n });
}
/** Daily status snapshot (call from an existing daily job). Only whitelisted aggregate keys are accepted centrally. */
export const sendSecurityStatus = (status: SecurityStatus): Promise<Result> => post({ type: 'status', status });
