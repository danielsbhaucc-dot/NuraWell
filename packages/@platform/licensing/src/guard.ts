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
  pollHours?: number;
  fetch?: (url: string) => Promise<unknown>;
  /** Persists the highest list version seen (rollback protection) and the last good list. */
  cache?: { get(): Promise<RevocationList | null> | RevocationList | null; set(l: RevocationList): Promise<void> | void };
  /** Bundle integrity result computed at boot (verifyBundle). */
  integrityOk?: boolean;
  lockedMessage?: string;
  /** Optional per-module online verifier (any host). Unreachable → offline license still decides, until it expires. */
  online?: OnlineConfig & { enabled: boolean; cacheSeconds?: number };
  now?: () => Date;
};
export type GuardStatus =
  | { state: 'active'; license: License; expiresAt: string | null }
  | { state: 'locked'; reason: LockReason; message: string; revocation?: RevocationEntry };
export type LockReason = Extract<LicenseCheck, { ok: false }>['reason'] | 'revoked' | 'suspended' | 'tampered' | 'no_license' | 'online_refused';

export const DEFAULT_LOCKED_MESSAGE = 'הרכיב הזה נעול כרגע. פנו למי שמכר לכם את הרישיון כדי לחדש אותו.';

export function createLicenseGuard(cfg: GuardConfig) {
  const now = () => (cfg.now ? cfg.now() : new Date());
  const pollMs = Math.max(1, cfg.pollHours ?? 6) * 3_600_000;
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
      if (!fresh) return; // tampered or unsigned list: ignore, keep the last good one
      if (list && fresh.version < list.version) return; // rollback attempt: reject
      list = fresh;
      await cfg.cache?.set(fresh);
    } catch { /* unreachable: keep working until license expiry (the backstop) */ }
  }

  let lastOnline: { at: number; v: { ok: boolean; reason?: string } } | null = null;
  async function onlineVerdict() {
    const ttl = (cfg.online!.cacheSeconds ?? 60) * 1000;
    if (lastOnline && now().getTime() - lastOnline.at < ttl) return lastOnline.v;
    const r = await checkOnline(cfg.online!, { token: cfg.licenseToken, moduleId: cfg.moduleId, version: cfg.version, host: cfg.host ?? '' }, now());
    if (r.kind === 'unreachable') return null; // offline fallback
    lastOnline = { at: now().getTime(), v: r.verdict };
    return r.verdict;
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
      if (r) return { state: 'locked', reason: r.state === 'revoked_permanent' ? 'revoked' : 'suspended', message: msg, revocation: r };
      if (cfg.online?.enabled) {
        const v = await onlineVerdict();
        if (v && !v.ok) return { state: 'locked', reason: v.reason === 'revoked' ? 'revoked' : v.reason === 'suspended' ? 'suspended' : v.reason === 'domain_mismatch' ? 'domain_mismatch' : 'online_refused', message: msg };
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
