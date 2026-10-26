/**
 * Prompt caching for AI SDK calls (Almog memory-recall tool lane and any other streamText call).
 *
 * Measured 2026-10-26 on openai/gpt-5.6-terra via OpenRouter, identical 11.4k-token prompts:
 *  - system as one plain string (what the AI SDK sends): cached_tokens 0 on every call, and every call
 *    is billed as a cache *write* (1.25x input): $0.0288 per call.
 *  - system as content blocks with cache_control on the static block: 2nd call cached 11,422 tokens, $0.0025.
 * The direct-fetch lane already sends blocks (openRouterMessagesWithCachedSystem); the AI SDK lane did not.
 *
 * This is a pure transport change: the text the model receives is byte-identical, it is only split into
 * two content blocks at the end of a registered static prefix.
 */
const cacheablePrefixes = new Set<string>();

/**
 * Long cache life for OpenAI (Terra/Luna): `cache_control.ttl` is dropped toward OpenAI, so the static block
 * also carries OpenAI's own breakpoint with a 12h TTL. Tradeoff: a 12h write costs 2.5x input once instead of
 * 1.25x per 30-minute expiry; reads are the same 0.1x. The static prefix is identical for every user, so one
 * write can serve many sessions for 12h. Disable with AI_CHAT_OPENAI_CACHE_TTL=30m.
 */
export function openAiLongCacheBreakpoint(): { prompt_cache_breakpoint?: { mode: 'explicit'; ttl: string } } {
  const ttl = process.env.AI_CHAT_OPENAI_CACHE_TTL?.trim() || '12h';
  if (ttl !== '12h') return {};
  return { prompt_cache_breakpoint: { mode: 'explicit', ttl } };
}
const MIN_PREFIX_CHARS = 4000;

export function registerCacheablePrefix(prefix: string): void {
  if (prefix.length >= MIN_PREFIX_CHARS) cacheablePrefixes.add(prefix);
}

export function supportsBlockPromptCache(model: unknown): boolean {
  return typeof model === 'string' && (model.startsWith('openai/') || model.startsWith('anthropic/'));
}

type Msg = { role?: unknown; content?: unknown };

/** Returns a new body with the first system/developer message split into [cached static, dynamic]; or null. */
export function applyPromptCacheToBody(body: Record<string, unknown>): Record<string, unknown> | null {
  if (!supportsBlockPromptCache(body.model) || !Array.isArray(body.messages) || !cacheablePrefixes.size) return null;
  const messages = body.messages as Msg[];
  const idx = messages.findIndex((m) => m.role === 'system' || m.role === 'developer');
  if (idx < 0) return null;
  const content = messages[idx]!.content;
  if (typeof content !== 'string') return null;
  let best = '';
  for (const p of cacheablePrefixes) if (p.length > best.length && content.startsWith(p)) best = p;
  if (!best) return null;
  const rest = content.slice(best.length);
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: best,
      cache_control: { type: 'ephemeral' },
      ...(String(body.model).startsWith('openai/') ? openAiLongCacheBreakpoint() : {}),
    },
  ];
  if (rest) blocks.push({ type: 'text', text: rest });
  const next = messages.slice();
  next[idx] = { ...messages[idx], content: blocks };
  return { ...body, messages: next };
}

export function promptCacheFetch(baseFetch?: typeof fetch): typeof fetch {
  const base: typeof fetch = (i, n) => (baseFetch ?? globalThis.fetch)(i, n);
  return async (input, init) => {
    if (typeof init?.body !== 'string' || !cacheablePrefixes.size) return base(input, init);
    try {
      const next = applyPromptCacheToBody(JSON.parse(init.body) as Record<string, unknown>);
      if (next) return base(input, { ...init, body: JSON.stringify(next) });
    } catch {
      /* not JSON → untouched */
    }
    return base(input, init);
  };
}
