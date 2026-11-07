/**
 * OPTIONAL central adapter (product → parent console). OFF by default: sends only when KIT_CENTRAL_REPORTING=on
 * and the four CENTRAL_* env vars are set. The kit works fully without it (external customers never need it).
 * Never throws, never blocks the caller for more than 3 s, silently skips when env is missing.
 */
import { createHmac, randomBytes } from 'node:crypto';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export interface SecurityStatus { kits?: Record<string, string>; lockdown?: boolean | null; ipBlocksActive?: number | null; openIncidents?: number | null; denied24h?: number | null; loginFail24h?: number | null;
  events24h?: number | null; encOk?: boolean | null; lastAccessAudit?: string | null; accessAuditFlagged7d?: number | null }
type Result = 'sent' | 'skipped' | 'throttled' | 'failed';

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
const env = () => ({ product: process.env.CENTRAL_PRODUCT_ID, url: process.env.CENTRAL_SUPABASE_URL, key: process.env.CENTRAL_SUPABASE_SECRET_KEY, secret: process.env.CENTRAL_METRICS_FEED_SECRET });

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export function signSecurityBody(secret: string, body: string, ts = Date.now(), nonce = randomBytes(16).toString('hex')) {
  return { ts: String(ts), nonce, sig: createHmac('sha256', secret).update(`sec.${ts}.${nonce}.${body}`).digest('hex') };
}

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
async function post(body: object): Promise<Result> {
  const cfg = env();
  if (process.env.KIT_CENTRAL_REPORTING !== 'on' || !cfg.product || !cfg.url || !cfg.key || !cfg.secret) return 'skipped';
  try {
    const payload = JSON.stringify(body), { ts, nonce, sig } = signSecurityBody(cfg.secret, payload);
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/central_ingest_security`, {
      method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_product: cfg.product, p_body: payload, p_ts: ts, p_nonce: nonce, p_sig: sig }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

const last = new Map<string, { at: number; n: number }>();
/** One security event (kind = short code, no user data). Throttled per kind: at most one send per `everyMs`; skipped hits are counted into the next send. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export function sendSecurityEvent(kind: string, severity: Severity, everyMs = 600_000): Promise<Result> {
  if (!/^[a-z0-9_]{1,40}$/.test(kind)) return Promise.resolve('skipped');
  const now = Date.now(), prev = last.get(kind);
  if (prev && now - prev.at < everyMs) { prev.n += 1; return Promise.resolve('throttled'); }
  const n = (prev?.n ?? 0) + 1; last.set(kind, { at: now, n: 0 });
  return post({ type: 'event', kind, severity, n });
}
/** Daily status snapshot (call from an existing daily job). Only whitelisted aggregate keys are accepted centrally. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export const sendSecurityStatus = (status: SecurityStatus): Promise<Result> => post({ type: 'status', status });

/** Usage totals feed signature (central_ingest_metrics): HMAC-SHA256 over `${ts}.${body}`. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export function signUsage(secret: string, body: string, ts = Date.now()) {
  return { ts: String(ts), sig: createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') };
}
