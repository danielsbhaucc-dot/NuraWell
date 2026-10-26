import { hostMatches } from '../match';
import { canonicalRequest, hmacHex, safeEqual, sha256Hex } from './crypto';
import { REFUSAL_HE, type GatewayStore, type InstallRecord, type RefusalCode } from './types';

export type CoreFn = (input: unknown, ctx: { iid: string; lid: string; moduleId: string }) => Promise<unknown> | unknown;
export type GatewayConfig = {
  store: GatewayStore;
  /** moduleId → named core functions (the essential logic that never ships to buyers). */
  cores: Record<string, Record<string, CoreFn>>;
  /** Status cache per isolate: block/unblock lands within this window (default 5s). */
  statusCacheMs?: number;
  replayWindowSec?: number; // default 60
  rateLimit?: { perMinute: number }; // default 120 per install
  now?: () => number;
};

/** Portable (Request) => Response handler. Wrap with toHost('cloudflare' | 'vercel' | 'node', handler). */
export function createCoreGateway(cfg: GatewayConfig) {
  const now = () => (cfg.now ? cfg.now() : Date.now());
  const cacheMs = cfg.statusCacheMs ?? 5000; const win = cfg.replayWindowSec ?? 60;
  const cache = new Map<string, { at: number; r: InstallRecord | null }>();
  const load = async (iid: string) => {
    const c = cache.get(iid); if (c && now() - c.at < cacheMs) return c.r;
    const r = await cfg.store.get(iid); cache.set(iid, { at: now(), r }); return r;
  };
  const json = (b: unknown, status: number) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const refuse = (code: RefusalCode, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, code, message: REFUSAL_HE[code], ...extra }, status);

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) return json({ ok: true }, 200);
    const m = url.pathname.match(/\/core\/([a-z0-9-]+)\/([a-zA-Z0-9_]+)$/);
    if (req.method !== 'POST' || !m) return refuse('bad_request', 404);
    const [, moduleId, core] = m;
    const h = (k: string) => req.headers.get(k) ?? '';
    const iid = h('x-nw-install'), ts = h('x-nw-ts'), nonce = h('x-nw-nonce'), sig = h('x-nw-sig'), kv = h('x-nw-key-version');
    const origin = h('x-nw-origin') || h('origin');
    if (!iid || !ts || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return refuse('bad_request', 400);
    const body = await req.text(); if (body.length > 64_000) return refuse('bad_request', 413);
    if ((await cfg.store.hit(`rl:${iid}`, 60)) > (cfg.rateLimit?.perMinute ?? 120)) return refuse('rate_limited', 429);
    let rec = await load(iid);
    if (!rec || rec.moduleId !== moduleId) return refuse('unknown_install', 403);
    if (Math.abs(now() - Number(ts)) > win * 1000) return refuse('stale', 401);
    const bodyHash = await sha256Hex(body);
    const keyOk = async (r: InstallRecord) => String(r.keyVersion) === kv && safeEqual(await hmacHex(r.keyHash, canonicalRequest({ ts, nonce, origin, core, bodyHash, keyVersion: kv })), sig);
    if (!(await keyOk(rec))) { cache.delete(iid); rec = await load(iid); if (!rec || !(await keyOk(rec))) return refuse('bad_key', 401); } // fresh read: a just-rotated key works at once
    let host = ''; try { host = new URL(origin).hostname; } catch { /* empty */ }
    if (!host || !rec.domains.some((d) => hostMatches(host, d))) return refuse('wrong_domain', 403);
    if (!(await cfg.store.claimNonce(iid, nonce, win * 2))) return refuse('replay', 409);
    if (rec.state !== 'active') {
      const expired = rec.state === 'suspended_until' && rec.until && Date.parse(rec.until) <= now();
      if (!expired) return refuse(rec.state === 'suspended_until_payment' ? 'blocked_payment' : rec.state === 'suspended_until' ? 'blocked_temporary' : 'blocked_permanent', 403, { reason: rec.reason ?? null, until: rec.until ?? null });
    }
    const fn = cfg.cores[moduleId]?.[core];
    if (!fn) return refuse('unknown_core', 404);
    let input: unknown; try { input = body ? JSON.parse(body) : null; } catch { return refuse('bad_request', 400); }
    try { return json({ ok: true, data: await fn(input, { iid, lid: rec.lid, moduleId }) }, 200); } catch { return refuse('core_failed', 500); }
  };
}
