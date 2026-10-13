import { meteredFetch, type AiUsageMeta } from '@/lib/ai/usage-meter';
/**
 * OpenRouter calls with large prompts are slow from Vercel's syd1/fra1 (headers after ~5-6s for a
 * ~75KB chat prompt) but ~1s from iad1, next to OpenRouter/OpenAI. Probed 2026-10-12: the same
 * request from an iad1 edge function opened in ~0.9-1.1s. The chat function stays in syd1 (next
 * to Supabase) and sends its LLM request through a tiny edge relay pinned to iad1. Same model,
 * same body. Falls back to a direct call if the relay is unavailable.
 * Turn off with AI_OPENROUTER_RELAY=off.
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const RELAY_HEADER = 'x-nw-relay';

function relayBase(): string | null {
  if ((process.env.AI_OPENROUTER_RELAY ?? '').trim().toLowerCase() === 'off') return null;
  if (!process.env.CRON_SECRET) return null;
  /**
   * Production: the per-deployment URL (VERCEL_URL) sits behind Vercel Deployment Protection
   * (302 → SSO), so the relay never answered and every call fell back to the slow direct path.
   * The production domain is public — use it. Previews keep VERCEL_URL + the bypass header.
   */
  const prodHost =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').trim()
      : null;
  const host = prodHost || process.env.VERCEL_URL?.trim();
  return host ? `https://${host.replace(/\/+$/, '')}` : null;
}

/** POST a chat-completions body to OpenRouter, via the iad1 relay when available. Usage is metered (cost page). */
export function openRouterChatFetch(
  body: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  meta?: AiUsageMeta
): Promise<Response> {
  const base: typeof fetch = (_i, init) =>
    rawOpenRouterChatFetch(String(init?.body ?? body), headers, signal);
  return meteredFetch(base, meta)(OPENROUTER_URL, { method: 'POST', headers, body, signal });
}

async function rawOpenRouterChatFetch(
  body: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<Response> {
  const base = relayBase();
  if (base) {
    try {
      const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const res = await fetch(`${base}/api/v1/ai/llm-relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [RELAY_HEADER]: process.env.CRON_SECRET!,
          'x-nw-forward': JSON.stringify(pickForward(headers)),
          ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
        },
        body,
        signal,
      });
      if (res.headers.get('x-nw-relayed') === '1') return res;
      console.warn('[openrouter-relay] relay unavailable, direct call', { status: res.status });
      void res.body?.cancel();
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn('[openrouter-relay] relay error, direct call', err instanceof Error ? err.message : String(err));
    }
  }
  return fetch(OPENROUTER_URL, { method: 'POST', headers, body, signal });
}

const FORWARD = ['http-referer', 'x-title', 'x-openrouter-cache'];
function pickForward(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (FORWARD.includes(k.toLowerCase())) out[k] = v;
  return out;
}
