/**
 * The wire contract between a product and central (shared by the SDK and the ingest function — one source of truth).
 * Strict: unknown keys are refused, strings are short and pattern-bound, and anything that looks like personal data
 * (an email address, a phone number, a card number, an IP address) is refused with `pii` before it is stored.
 */
export const LIMITS = { bodyMax: 16_384, lightBodyMax: 1_024, usageEvents: 100, decisions: 50, skewMs: 5 * 60_000, usageDays: 2 } as const;
export const METRIC = /^[a-z][a-z0-9_.]{1,39}$/;
export const MODULE = /^[a-z][a-z0-9-]{1,40}$/;
export const PRODUCT = /^[a-z][a-z0-9-]{1,40}$/;
export const LIC = /^lic_[A-Za-z0-9_-]{4,80}$/;
export const KEY_ID = /^pk_[a-z0-9]{16}$/;
export const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,24})?$/;
export const INSTANCE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const HEALTH = ['ok', 'degraded', 'down'] as const;
export const REASONS = ['active', 'unknown_license', 'expired', 'suspended', 'revoked', 'wrong_product', 'stale_status', 'no_status', 'no_license'] as const;
export const PLATFORMS = ['web', 'ios', 'android', 'desktop'] as const;
export type Health = typeof HEALTH[number]; export type Reason = typeof REASONS[number];

export interface UsageEvent { id: string; metric: string; n: number; day: string }
export interface UsageBody { events: UsageEvent[] }
export interface HeartbeatBody { instance: string; version: string; health: Health; uptimeS?: number }
export interface Decision { moduleId: string; lic: string | null; local: 'allow' | 'block'; reason: Reason; at: string }
export interface DecisionBody { decisions: Decision[] }
export interface LightBody { installId: string; version: string; health: Health; platform?: typeof PLATFORMS[number] }

const PII: [RegExp, string][] = [[/[^\s@]+@[^\s@]+\.[^\s@]+/, 'email'], [/(?:\+|\b0)\d[\d\s().-]{7,}\d/, 'phone'], [/\b(?:\d[ -]?){13,19}\b/, 'card'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'ip'], [/\b\d{9}\b/, 'national_id']];
/** Walks every string (keys and values). Returns the kind of personal data found, or null. */
export function findPii(x: unknown, depth = 0): string | null {
  if (depth > 6) return 'deep';
  if (typeof x === 'string') { if (UUID.test(x) || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(x)) return null; for (const [re, k] of PII) if (re.test(x)) return k; return null; }
  if (Array.isArray(x)) { for (const v of x) { const r = findPii(v, depth + 1); if (r) return r; } return null; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const r = findPii(k, depth + 1) ?? findPii(v, depth + 1); if (r) return r; }
  return null;
}
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const only = (o: Record<string, unknown>, keys: string[], opt: string[] = []) => keys.every(k => k in o) && Object.keys(o).every(k => keys.includes(k) || opt.includes(k));
const day = (s: unknown, now: number) => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + 'T00:00:00Z'); const today = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z'); return t <= today && t >= today - LIMITS.usageDays * 864e5; };
const iso = (s: unknown, now: number) => typeof s === 'string' && s.length <= 30 && !Number.isNaN(Date.parse(s)) && Math.abs(Date.parse(s) - now) <= 86_400_000;

export type Check<T> = { ok: true; value: T } | { ok: false; error: 'invalid' | 'pii' };
const pii = <T>(x: unknown, v: () => boolean): Check<T> => findPii(x) ? { ok: false, error: 'pii' } : v() ? { ok: true, value: x as T } : { ok: false, error: 'invalid' };

export const checkUsage = (x: unknown, now = Date.now()): Check<UsageBody> => pii(x, () => obj(x) && only(x, ['events']) && Array.isArray(x.events) && x.events.length >= 1 && x.events.length <= LIMITS.usageEvents
  && new Set(x.events.map((e: { id?: unknown }) => e?.id)).size === x.events.length
  && x.events.every((e: unknown) => obj(e) && only(e, ['id', 'metric', 'n', 'day']) && typeof e.id === 'string' && UUID.test(e.id) && typeof e.metric === 'string' && METRIC.test(e.metric)
    && Number.isInteger(e.n) && (e.n as number) >= 1 && (e.n as number) <= 1_000_000 && day(e.day, now)));
export const checkHeartbeat = (x: unknown): Check<HeartbeatBody> => pii(x, () => obj(x) && only(x, ['instance', 'version', 'health'], ['uptimeS']) && typeof x.instance === 'string' && INSTANCE.test(x.instance)
  && typeof x.version === 'string' && VERSION.test(x.version) && HEALTH.includes(x.health as Health) && (x.uptimeS === undefined || (Number.isInteger(x.uptimeS) && (x.uptimeS as number) >= 0 && (x.uptimeS as number) < 1e9)));
export const checkDecisions = (x: unknown, now = Date.now()): Check<DecisionBody> => {
  // License ids are server-issued (pattern-bound), so they are excluded from the PII scan; everything else is scanned.
  const scan = obj(x) && Array.isArray(x.decisions) ? { ...x, decisions: x.decisions.map((d: unknown) => obj(d) ? { ...d, lic: null } : d) } : x;
  if (findPii(scan)) return { ok: false, error: 'pii' };
  const v = obj(x) && only(x, ['decisions']) && Array.isArray(x.decisions) && x.decisions.length >= 1 && x.decisions.length <= LIMITS.decisions
    && x.decisions.every((d: unknown) => obj(d) && only(d, ['moduleId', 'lic', 'local', 'reason', 'at']) && typeof d.moduleId === 'string' && (d.moduleId === '*' || MODULE.test(d.moduleId))
      && (d.lic === null || (typeof d.lic === 'string' && LIC.test(d.lic))) && (d.local === 'allow' || d.local === 'block') && REASONS.includes(d.reason as Reason) && iso(d.at, now));
  return v ? { ok: true, value: x as unknown as DecisionBody } : { ok: false, error: 'invalid' };
};
export const checkLight = (x: unknown): Check<LightBody> => pii(x, () => obj(x) && only(x, ['installId', 'version', 'health'], ['platform']) && typeof x.installId === 'string' && UUID.test(x.installId)
  && typeof x.version === 'string' && VERSION.test(x.version) && HEALTH.includes(x.health as Health) && (x.platform === undefined || PLATFORMS.includes(x.platform as typeof PLATFORMS[number])));
