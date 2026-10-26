import { canonicalRequest, hmacHex, randomHex, sha256Hex, signingKeyFromSecret } from './crypto';
import { REFUSAL_HE, type RefusalCode } from './types';

/** Thin client the buyer installs. Contains NO core logic: it signs a request and shows a Hebrew message if refused. */
export type CoreClientConfig = { url: string; moduleId: string; installId: string; secret: string; keyVersion: number; origin: string; fetch?: typeof fetch; timeoutMs?: number };
export type CoreResult<T> = { ok: true; data: T } | { ok: false; code: RefusalCode | 'unreachable'; message: string };
export const UNREACHABLE_HE = 'אין כרגע חיבור לשירות. נסו שוב בעוד רגע.';

export function createCoreClient(c: CoreClientConfig) {
  const key = signingKeyFromSecret(c.secret);
  return {
    async call<T = unknown>(core: string, input: unknown): Promise<CoreResult<T>> {
      const body = JSON.stringify(input ?? null); const ts = String(Date.now()); const nonce = randomHex(16);
      const sig = await hmacHex(await key, canonicalRequest({ ts, nonce, origin: c.origin, core, bodyHash: await sha256Hex(body), keyVersion: String(c.keyVersion) }));
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), c.timeoutMs ?? 8000);
      try {
        const r = await (c.fetch ?? fetch)(`${c.url.replace(/\/$/, '')}/core/${c.moduleId}/${core}`, { method: 'POST', body, signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-nw-install': c.installId, 'x-nw-ts': ts, 'x-nw-nonce': nonce, 'x-nw-sig': sig, 'x-nw-key-version': String(c.keyVersion), 'x-nw-origin': c.origin } });
        const d = (await r.json().catch(() => null)) as { ok: boolean; data?: T; code?: RefusalCode } | null;
        if (d?.ok) return { ok: true, data: d.data as T };
        const code = (d?.code ?? 'core_failed') as RefusalCode;
        return { ok: false, code, message: REFUSAL_HE[code] ?? REFUSAL_HE.core_failed };
      } catch { return { ok: false, code: 'unreachable', message: UNREACHABLE_HE }; } finally { clearTimeout(t); }
    },
  };
}
