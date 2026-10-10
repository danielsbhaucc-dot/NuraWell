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

/** Pure transform (unit-tested): returns the adjusted JSON body. */
export function adaptGroqChatBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!isGptOssModel(body.model)) return body;
  const out: Record<string, unknown> = { ...body };
  if (out.reasoning_effort === undefined) out.reasoning_effort = reasoningEffort();
  if (out.include_reasoning === undefined) out.include_reasoning = false;
  for (const key of ['max_tokens', 'max_completion_tokens'] as const) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = Math.min(65_536, v + GROQ_GPT_OSS_REASONING_HEADROOM);
    }
  }
  return out;
}

export const groqCompatFetch: typeof fetch = async (input, init) => {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (init?.body && typeof init.body === 'string' && /\/chat\/completions$/.test(new URL(url).pathname)) {
      const parsed = JSON.parse(init.body) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const adapted = adaptGroqChatBody(parsed as Record<string, unknown>);
        if (adapted !== parsed) {
          return fetch(input, { ...init, body: JSON.stringify(adapted) });
        }
      }
    }
  } catch {
    /* fall through: send the request unchanged */
  }
  return fetch(input, init);
};
