import 'server-only';
import { sha256hex, signRequest } from '@core/product-link';

/**
 * Honor the parent-platform AI controls (kill switch, caps, journal) around NuraWell's existing
 * OpenRouter/Groq/DeepSeek calls. Inference stays here so Almog is unchanged when the parent
 * allows a run. The parent is reached over the signed product-link /v1/central bridge — no
 * extra gateway key, no prompt text (only a feature label). Fail-open if the parent is down or
 * the product is not connected; fail-closed on product_kill, global_kill, rate, or a cap that
 * needs a one-time approval.
 */
type Env = Record<string, string | undefined>;
export type ParentAiStatus = { status: 'ok' | 'not_connected'; globalEnabled?: boolean; enabled?: boolean; monthlyCap?: number; runCap?: number; spent?: number };
export type ParentAiAdmit =
  | { status: 'run'; runId: string }
  | { status: 'blocked'; reason: string }
  | { status: 'approval_required'; approvalId: string; estUsd: number; reason: string }
  | { status: 'not_connected' | 'invalid' | 'model_not_allowed' | 'unavailable' };

const PATH = '/v1/central';
const PURPOSE = /^[a-z][a-z0-9_.-]{1,40}$/;
const TIMEOUT_MS = 2_500;

function conf(env: Env) {
  const base = (env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, ''), keyId = env.PRODUCT_LINK_KEY_ID ?? '', secret = env.PRODUCT_LINK_SECRET ?? '';
  return base.startsWith('https://') && keyId && secret ? { base, keyId, secret } : null;
}

async function rpc(fn: string, args: Record<string, unknown>, env: Env, fetchImpl: typeof fetch, timeoutMs = TIMEOUT_MS): Promise<{ data: unknown; error: string | null }> {
  const c = conf(env);
  if (!c) return { data: null, error: 'central_not_configured' };
  try {
    const bytes = new TextEncoder().encode(JSON.stringify({ fn, args }));
    const signed = await signRequest(c.keyId, c.secret, PATH, bytes, Date.now());
    const r = await fetchImpl(`${c.base}/functions/v1/product-link${PATH}`, {
      method: 'POST', body: bytes, signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', ...signed }, cache: 'no-store',
    });
    const j = (await r.json().catch(() => null)) as { data?: unknown; error?: string } | null;
    if (!r.ok) return { data: null, error: typeof j?.error === 'string' ? j.error.slice(0, 64) : `http_${r.status}` };
    return { data: j?.data ?? null, error: null };
  } catch {
    return { data: null, error: 'central_unavailable' };
  }
}

export function parentAiPurpose(feature: string | null | undefined): string {
  const f = (feature ?? '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return PURPOSE.test(f) ? f : 'ai.other';
}

export async function parentAiStatus(env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<ParentAiStatus> {
  const r = await rpc('ai_status_link', {}, env, fetchImpl);
  const d = r.data as ParentAiStatus | null;
  if (r.error || !d || (d.status !== 'ok' && d.status !== 'not_connected')) return { status: 'not_connected' };
  return d;
}

export async function parentAiAdmit(o: { feature: string; model: string; estUsd: number; maxTokens: number }, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<ParentAiAdmit> {
  const purpose = parentAiPurpose(o.feature);
  const model = o.model.slice(0, 80) || 'unknown';
  const est = Number.isFinite(o.estUsd) ? Math.min(50, Math.max(0, o.estUsd)) : 0.01;
  const maxTokens = Number.isInteger(o.maxTokens) && o.maxTokens >= 1 ? Math.min(32_000, o.maxTokens) : 300;
  const hash = await sha256hex(`${purpose}|${model}|${maxTokens}`);
  const r = await rpc('ai_admit_link', {
    p_model: model, p_purpose: purpose, p_est: est, p_max_tokens: maxTokens,
    p_prompt_hash: hash, p_redacted: `feature:${purpose}`, p_approval: null, p_mock: false,
  }, env, fetchImpl);
  if (r.error) return { status: 'unavailable' };
  const d = r.data as ParentAiAdmit | null;
  if (!d || typeof d !== 'object' || typeof (d as { status?: unknown }).status !== 'string') return { status: 'unavailable' };
  return d;
}

export async function parentAiFinish(runId: string, o: { ok: boolean; costUsd: number; tokensIn: number; tokensOut: number; ms: number; error?: string | null }, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return;
  await rpc('ai_finish_link', {
    p_run: runId, p_ok: o.ok, p_cost: Math.max(0, o.costUsd || 0), p_tin: Math.max(0, o.tokensIn || 0),
    p_tout: Math.max(0, o.tokensOut || 0), p_ms: Math.max(0, o.ms || 0), p_error: o.error ? String(o.error).slice(0, 60) : null,
  }, env, fetchImpl, 2_000);
}

/** Conservative pre-flight estimate when the provider has not billed yet. About 3 chars per token, cheap default rates. */
export function estimateCallUsd(body: Record<string, unknown>): { estUsd: number; maxTokens: number; model: string } {
  const model = typeof body.model === 'string' ? body.model : 'unknown';
  const maxTokens = Number.isInteger(body.max_tokens) ? Math.min(32_000, Math.max(1, body.max_tokens as number)) : 300;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const chars = messages.reduce((n, m) => n + (m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string' ? (m as { content: string }).content.length : 0), 0);
  const tin = Math.ceil(chars / 3);
  // 0.15/0.6 per 1M tokens is the cheap default; the parent journals the provider's real cost on finish.
  const estUsd = Math.round(((tin * 0.15 + maxTokens * 0.6) / 1e6) * 1e6) / 1e6;
  return { model, maxTokens, estUsd: Math.max(0.0001, estUsd) };
}

export function blockedProviderResponse(reason: string): Response {
  return new Response(JSON.stringify({ error: { message: 'parent_ai_blocked', code: reason } }), {
    status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-parent-ai-blocked': reason.slice(0, 40) },
  });
}
