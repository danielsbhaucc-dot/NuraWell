import { meteredFetch } from './usage-meter';
/**
 * Groq ↔ gpt-oss compatibility layer.
 *
 * Groq retired Llama 4 Scout (2026-07-17), Llama 4 Maverick (2026-03-09) and
 * llama-3.3-70b-versatile (2026-08-16). The supported replacements are
 * `openai/gpt-oss-20b` / `openai/gpt-oss-120b`. Both are reasoning models:
 * reasoning tokens count against `max_tokens`, so existing small budgets
 * (e.g. 80 for a classifier) could end up with empty `content`.
 *
 * This fetch wrapper rewrites only chat-completion requests whose model is gpt-oss:
 *  - `reasoning_effort: 'low'` (unless the caller set one): cheaper and faster,
 *    and enough for short classification/JSON tasks. Override: GROQ_GPT_OSS_REASONING_EFFORT.
 *  - `include_reasoning: false`: the answer text stays in `content` only.
 *  - adds a reasoning headroom to `max_tokens` / `max_completion_tokens`, so the
 *    visible answer keeps the same budget it had with Llama.
 * All other models and requests pass through unchanged.
 */
export const GROQ_GPT_OSS_REASONING_HEADROOM = 512;

export function isGptOssModel(model: unknown): boolean {
  return typeof model === 'string' && /(^|\/)gpt-oss/i.test(model);
}

function reasoningEffort(): 'low' | 'medium' | 'high' {
  const raw = process.env.GROQ_GPT_OSS_REASONING_EFFORT?.trim().toLowerCase();
  return raw === 'medium' || raw === 'high' ? raw : 'low';
}

/**
 * Background ("Groq lane") routing: a direct Groq key is used only if GROQ_API_KEY is set.
 * Otherwise the lane goes through OpenRouter (existing OPENROUTER_API_KEY) with the
 * same gpt-oss model ids, preferring the Groq provider: `provider.order=['groq']` with
 * `allow_fallbacks=true`, so OpenRouter moves to another host if Groq is unavailable.
 */
export function groqLaneUsesDirectGroq(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/** True when the background lane can run (direct Groq or via OpenRouter). */
export function isGroqLaneAvailable(): boolean {
  return groqLaneUsesDirectGroq() || Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function groqLaneBaseUrl(): string {
  return groqLaneUsesDirectGroq() ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1';
}

export function groqLaneApiKey(): string {
  return (
    process.env.GROQ_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  );
}

/** gpt-5 / gpt-5-mini / gpt-5-nano reason by default; `gpt-5-chat` does not. */
export function isGpt5ReasoningModel(model: unknown): boolean {
  return typeof model === 'string' && /(^|\/)gpt-5(\.\d+)?(-mini|-nano)?$/i.test(model);
}

/**
 * Reasoning tokens count against `max_tokens`. With the small budgets used by the
 * JSON helpers (400-700) gpt-5-mini spent the whole budget thinking and returned
 * empty `content` (finish_reason=length), so every caller silently fell back to
 * templates. Default to low effort, hide the reasoning, and add headroom.
 */
export const GPT5_REASONING_HEADROOM = 1_200;
function adaptGpt5Body(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (out.reasoning === undefined && out.reasoning_effort === undefined) {
    out.reasoning = { effort: 'low', exclude: true };
  }
  for (const key of ['max_tokens', 'max_completion_tokens'] as const) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(65_536, v + GPT5_REASONING_HEADROOM);
  }
  return out;
}

/** Pure transform (unit-tested): returns the adjusted JSON body. */
export function adaptGroqChatBody(
  body: Record<string, unknown>,
  opts: { viaOpenRouter?: boolean } = {}
): Record<string, unknown> {
  if (opts.viaOpenRouter && isGpt5ReasoningModel(body.model)) return adaptGpt5Body(body);
  if (!isGptOssModel(body.model)) return body;
  const out: Record<string, unknown> = { ...body };
  if (opts.viaOpenRouter) {
    if (out.reasoning === undefined) out.reasoning = { effort: reasoningEffort(), exclude: true };
    if (out.provider === undefined) out.provider = { order: ['groq'], allow_fallbacks: true };
  } else {
    if (out.reasoning_effort === undefined) out.reasoning_effort = reasoningEffort();
    if (out.include_reasoning === undefined) out.include_reasoning = false;
  }
  for (const key of ['max_tokens', 'max_completion_tokens'] as const) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = Math.min(65_536, v + GROQ_GPT_OSS_REASONING_HEADROOM);
    }
  }
  return out;
}

const metered = meteredFetch();

export const groqCompatFetch: typeof fetch = async (input, init) => {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const parsedUrl = new URL(url);
    if (init?.body && typeof init.body === 'string' && /\/chat\/completions$/.test(parsedUrl.pathname)) {
      const parsed = JSON.parse(init.body) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const adapted = adaptGroqChatBody(parsed as Record<string, unknown>, {
          viaOpenRouter: parsedUrl.hostname === 'openrouter.ai',
        });
        if (adapted !== parsed) {
          return metered(input, { ...init, body: JSON.stringify(adapted) });
        }
      }
    }
  } catch {
    /* fall through: send the request unchanged */
  }
  return metered(input, init);
};
