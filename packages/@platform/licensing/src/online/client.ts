import { canonicalJson } from '../canonical';
import type { SignedVerdict, VerifyVerdict } from './protocol';
import { b64uDecode, importPublic, randomId, verifyStr } from './webcrypto';

export type OnlineConfig = { url: string; verifierPublicKeyPem: string; timeoutMs?: number; fetch?: typeof fetch; maxSkewMs?: number };
/** 'unreachable' → caller falls back to the offline license (until it expires). A forged/replayed answer counts as unreachable. */
export type OnlineResult = { kind: 'verdict'; verdict: VerifyVerdict } | { kind: 'unreachable' };

export async function checkOnline(o: OnlineConfig, req: { token: string; moduleId: string; version: string; host: string; core?: { name: string; input: unknown } }, now = new Date()): Promise<OnlineResult> {
  const nonce = randomId();
  const f = o.fetch ?? globalThis.fetch;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 3000);
  try {
    const r = await f(o.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...req, nonce }), signal: ctl.signal });
    if (!r.ok) return { kind: 'unreachable' };
    const d = (await r.json()) as SignedVerdict;
    if (!d?.verdict || typeof d.sig !== 'string') return { kind: 'unreachable' };
    if (!(await verifyStr(await importPublic(o.verifierPublicKeyPem), canonicalJson(d.verdict), b64uDecode(d.sig)))) return { kind: 'unreachable' };
    if (d.verdict.nonce !== nonce || Math.abs(Date.parse(d.verdict.at) - now.getTime()) > (o.maxSkewMs ?? 10 * 60_000)) return { kind: 'unreachable' };
    return { kind: 'verdict', verdict: d.verdict };
  } catch { return { kind: 'unreachable' }; } finally { clearTimeout(t); }
}
