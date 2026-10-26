import { canonicalJson } from '../canonical';
import { hostMatches } from '../match';
import { satisfies } from '../semver';
import type { License } from '../license';
import type { VerifierStorage } from './storage';
import type { SignedVerdict, VerifyRequest, VerifyVerdict } from './protocol';
import { b64uDecode, importPrivate, importPublic, signStr, verifyStr } from './webcrypto';

/** Optional server-core: tiny functions that run on OUR verifier, only for a valid, unrevoked license. Not used by any module yet. */
export type ServerCore = (input: unknown, license: License) => Promise<unknown> | unknown;
export type VerifierConfig = {
  licensePublicKeyPem: string;
  verifierPrivateKeyPem: string;
  storage: VerifierStorage;
  /** moduleId → enabled. Modules not listed are refused (the online check is opt-in per module). */
  modules: Record<string, { enabled: boolean; cores?: Record<string, ServerCore> }>;
  now?: () => Date;
};

/** Portable Web-standard handler: (Request) => Promise<Response>. No Node-only APIs. */
export function createVerifierHandler(cfg: VerifierConfig): (req: Request) => Promise<Response> {
  const keys = Promise.all([importPublic(cfg.licensePublicKeyPem), importPrivate(cfg.verifierPrivateKeyPem)]);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return async (req) => {
    if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) return json({ ok: true });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    let body: VerifyRequest;
    try { body = (await req.json()) as VerifyRequest; } catch { return json({ error: 'bad_request' }, 400); }
    if (!body || typeof body.token !== 'string' || typeof body.nonce !== 'string' || body.nonce.length > 64 || typeof body.host !== 'string') return json({ error: 'bad_request' }, 400);
    const [pub, priv] = await keys;
    const now = (cfg.now ? cfg.now() : new Date());
    const verdict: VerifyVerdict = { v: 1, lid: null, nonce: body.nonce, at: now.toISOString(), ok: false };
    const sign = async () => json({ verdict, sig: await signStr(priv, canonicalJson(verdict)) } satisfies SignedVerdict);
    const mod = cfg.modules[body.moduleId];
    if (!mod?.enabled) { verdict.reason = 'module_not_online'; return sign(); }
    const parts = body.token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'nwl1' || !(await verifyStr(pub, `${parts[0]}.${parts[1]}`, b64uDecode(parts[2])))) { verdict.reason = 'bad_signature'; return sign(); }
    let l: License;
    try { l = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1]))) as License; } catch { verdict.reason = 'malformed'; return sign(); }
    verdict.lid = l.lid;
    if (l.moduleId !== body.moduleId) verdict.reason = 'wrong_module';
    else if (l.expiresAt && Date.parse(l.expiresAt) <= now.getTime()) verdict.reason = 'expired';
    else if (!satisfies(body.version, l.versionRange)) verdict.reason = 'version_out_of_range';
    else if (l.domains.length && !l.domains.some((d) => hostMatches(body.host, d))) verdict.reason = 'domain_mismatch';
    if (verdict.reason) return sign();
    const r = await cfg.storage.get(l.lid);
    const active = r && !(r.state === 'suspended_until' && r.until && Date.parse(r.until) <= now.getTime());
    if (active) { verdict.reason = r.state === 'revoked_permanent' ? 'revoked' : 'suspended'; verdict.state = r.state; verdict.until = r.until; return sign(); }
    await cfg.storage.noteSeen?.(l.lid, body.host.toLowerCase()).catch(() => undefined);
    verdict.ok = true;
    if (body.core) {
      const fn = mod.cores?.[body.core.name];
      if (!fn) { verdict.ok = false; verdict.reason = 'unknown_core'; return sign(); }
      try { verdict.core = await fn(body.core.input, l); } catch { verdict.ok = false; verdict.reason = 'core_failed'; }
    }
    return sign();
  };
}
