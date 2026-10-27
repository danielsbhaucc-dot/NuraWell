import { verifyLicense, type License, type LicenseCheck } from './license';
import { checkOnline, type OnlineConfig } from './online/client';
import { verifyRevocationList, revocationFor, type RevocationList, type RevocationEntry } from './revocation';

/** Runs inside the BUYER's install. No call home: only an optional poll of a public static revocation file. */
export type GuardConfig = {
  moduleId: string;
  version: string;
  publicKeyPem: string;
  /** The one config entry the buyer adds. */
  licenseToken: string;
  host?: string;
  instance?: string;
  /** Public static file (free static hosting). Omit = license expiry is the only control. */
  revocationUrl?: string;
  /** @deprecated use pollMinutes. */
  pollHours?: number;
  /** Status file poll interval (default 2). */
  pollMinutes?: number;
  /** Keep working this long when the status file can't be fetched (default 6). A block already seen always stays. */
  graceHours?: number;
  fetch?: (url: string) => Promise<unknown>;
  /** Persists the highest list version seen (rollback protection) and the last good list. */
  cache?: { get(): Promise<RevocationList | null> | RevocationList | null; set(l: RevocationList): Promise<void> | void };
  /** Bundle integrity result computed at boot (verifyBundle). */
  integrityOk?: boolean;
  lockedMessage?: string;
  /** Optional online verifier / gateway (premium). Default sold modules use sealed offline + static status file. */
  online?: OnlineConfig & { enabled: boolean; cacheSeconds?: number; blockedRecheckSeconds?: number; graceHours?: number };
  now?: () => Date;
};
export type GuardStatus =
  | { state: 'active'; license: License; expiresAt: string | null }
  | { state: 'locked'; reason: LockReason; message: string; revocation?: RevocationEntry };
export type LockReason = Extract<LicenseCheck, { ok: false }>['reason'] | 'revoked' | 'suspended' | 'tampered' | 'no_license' | 'online_refused' | 'offline_too_long';

export const DEFAULT_LOCKED_MESSAGE = 'הרכיב הזה נעול כרגע. פנו למי שמכר לכם את הרישיון כדי לחדש אותו.';

export const OFFLINE_MESSAGE = 'לא הצלחנו לבדוק את הרישיון כבר כמה שעות. בדקו את החיבור לאינטרנט; הרכיב יחזור לעבוד מיד כשהבדיקה תצליח.';

export function createLicenseGuard(cfg: GuardConfig) {
  const now = () => (cfg.now ? cfg.now() : new Date());
  // Primary path: signed static status file (free static hosting, ~60s cache). Poll ~2 min; 6h grace if it can't be fetched.
  const pollMs = cfg.pollHours != null ? Math.max(1, cfg.pollHours) * 3_600_000 : Math.max(0.5, cfg.pollMinutes ?? 2) * 60_000;
  const listGraceMs = (cfg.graceHours ?? 6) * 3_600_000;
  const startedAt = now().getTime();
  let lastListOkAt: number | null = null;
  let list: RevocationList | null = null;
  let lastPoll = 0;
  const msg = cfg.lockedMessage ?? DEFAULT_LOCKED_MESSAGE;

  async function refresh(force = false): Promise<void> {
    try {
      if (!list && cfg.cache) list = (await cfg.cache.get()) ?? null;
    } catch { /* cache unreadable → behave as if empty */ }
    if (!cfg.revocationUrl || !cfg.fetch) return;
    if (!force && now().getTime() - lastPoll < pollMs) return;
    lastPoll = now().getTime();
    try {
      const fresh = verifyRevocationList(await cfg.fetch(cfg.revocationUrl), cfg.publicKeyPem);
      if (!fresh) return;
      if (list && fresh.version < list.version) return; // rollback attempt: reject (and it does not count as a fresh check)
      lastListOkAt = now().getTime(); // tampered or unsigned list: ignored above, keep the last good one
      list = fresh;
      await cfg.cache?.set(fresh);
    } catch { /* unreachable: keep working until license expiry (the backstop) */ }
  }

  // Optional online check (premium): ask every ~5 min; while blocked ask every ~1 min so unblock lands fast.
  // Outage: a seen block always wins; otherwise keep working for graceHours since the last good answer.
  type V = { ok: boolean; reason?: string; until?: string };
  let lastOnline: { at: number; v: V } | null = null;
  let lastGoodAt: number | null = null;
  const firstAt = now().getTime();
  const tempExpired = (v: V) => v.reason === 'suspended' && Boolean(v.until) && Date.parse(v.until!) <= now().getTime();
  async function onlineVerdict(): Promise<V | null> {
    const o = cfg.online!;
    const okTtl = (o.cacheSeconds ?? 300) * 1000; const blockedTtl = (o.blockedRecheckSeconds ?? 60) * 1000;
    const t = now().getTime();
    if (lastOnline && t - lastOnline.at < (lastOnline.v.ok ? okTtl : blockedTtl) && !tempExpired(lastOnline.v)) return lastOnline.v.ok ? null : lastOnline.v;
    const r = await checkOnline(o, { token: cfg.licenseToken, moduleId: cfg.moduleId, version: cfg.version, host: cfg.host ?? '' }, now());
    if (r.kind === 'verdict') {
      lastOnline = { at: t, v: r.verdict };
      if (r.verdict.ok) { lastGoodAt = t; return null; }
      return r.verdict;
    }
    if (lastOnline && !lastOnline.v.ok && !tempExpired(lastOnline.v)) return lastOnline.v; // explicit block wins during an outage
    const graceMs = (o.graceHours ?? 6) * 3_600_000;
    if (t - (lastGoodAt ?? firstAt) <= graceMs) return null;
    return { ok: false, reason: 'offline_too_long' };
  }

  /** Optional server-core call (only when the module opted in). Locked or unreachable → null, never a throw. */
  async function callCore(name: string, input: unknown): Promise<unknown | null> {
    try {
      if (!cfg.online?.enabled || (await status()).state !== 'active') return null;
      const r = await checkOnline(cfg.online, { token: cfg.licenseToken, moduleId: cfg.moduleId, version: cfg.version, host: cfg.host ?? '', core: { name, input } }, now());
      return r.kind === 'verdict' && r.verdict.ok ? (r.verdict.core ?? null) : null;
    } catch { return null; }
  }

  async function status(): Promise<GuardStatus> {
    try {
      if (cfg.integrityOk === false) return { state: 'locked', reason: 'tampered', message: msg };
      if (!cfg.licenseToken) return { state: 'locked', reason: 'no_license', message: msg };
      const c = verifyLicense(cfg.licenseToken, cfg.publicKeyPem, { moduleId: cfg.moduleId, version: cfg.version, host: cfg.host, instance: cfg.instance, now: now() });
      if (!c.ok) return { state: 'locked', reason: c.reason, message: msg };
      await refresh();
      const r = revocationFor(list, c.license.lid, now());
      if (!r && cfg.revocationUrl && cfg.fetch && now().getTime() - (lastListOkAt ?? startedAt) > listGraceMs) return { state: 'locked', reason: 'offline_too_long', message: OFFLINE_MESSAGE };
      if (r) return { state: 'locked', reason: r.state === 'revoked_permanent' ? 'revoked' : 'suspended', message: msg, revocation: r };
      if (cfg.online?.enabled) {
        const v = await onlineVerdict();
        if (v) return { state: 'locked', reason: v.reason === 'revoked' ? 'revoked' : v.reason === 'suspended' ? 'suspended' : v.reason === 'domain_mismatch' ? 'domain_mismatch' : v.reason === 'offline_too_long' ? 'offline_too_long' : 'online_refused', message: v.reason === 'offline_too_long' ? OFFLINE_MESSAGE : msg };
      }
      return { state: 'active', license: c.license, expiresAt: c.license.expiresAt };
    } catch {
      return { state: 'locked', reason: 'malformed', message: msg }; // never throw into the host app
    }
  }

  /** Wraps a module entry point: locked → fallback value, never an exception in the host. */
  async function run<T>(fn: () => Promise<T> | T, locked: (s: Extract<GuardStatus, { state: 'locked' }>) => T): Promise<T> {
    const s = await status();
    if (s.state !== 'active') return locked(s);
    return fn();
  }

  return { status, run, refresh, callCore };
}
