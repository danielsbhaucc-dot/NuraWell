import { withTimeoutFetch } from '../timeout';
import type { AiProvider, CompletionRequest, CompletionResult } from '../types';

export type OpenAiCompatibleOptions = {
  /** Injected by the product (server env); the package never reads env itself. */
  apiKey: string;
  baseURL?: string;
  /** Attribution headers (OpenRouter). */
  title?: string;
  referer?: string;
  fetch?: typeof fetch;
  timeoutMs?: number | null;
};

type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };

/** Minimal Chat Completions client (OpenRouter by default) that returns billed usage. */
export function createOpenAiCompatibleProvider(o: OpenAiCompatibleOptions): AiProvider {
  const base = (o.baseURL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const f = withTimeoutFetch(o.fetch ?? fetch, o.timeoutMs === undefined ? 60_000 : o.timeoutMs);
  return {
    id: base.includes('openrouter') ? 'openrouter' : 'openai-compatible',
    async complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResult> {
      const res = await f(`${base}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${o.apiKey}`,
          'content-type': 'application/json',
          ...(o.title ? { 'X-Title': o.title } : {}),
          ...(o.referer ? { 'HTTP-Referer': o.referer } : {}),
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          usage: { include: true },
        }),
      });
      if (!res.ok) throw new Error(`AI provider HTTP ${res.status}`);
      const j = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[]; usage?: Usage };
      const u = j.usage ?? {};
      return {
        text: j.choices?.[0]?.message?.content ?? '',
        model: j.model ?? req.model,
        usage: {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
          costUsd: typeof u.cost === 'number' ? u.cost : 0,
        },
      };
    },
  };
}
