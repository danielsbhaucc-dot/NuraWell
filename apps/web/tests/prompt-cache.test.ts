import { describe, it, expect } from 'vitest';
import { applyPromptCacheToBody, registerCacheablePrefix } from '../lib/ai/prompt-cache';

const STATIC = 'א'.repeat(5000) + '\n\n';
registerCacheablePrefix(STATIC);

describe('prompt cache transport', () => {
  it('splits a registered static prefix into a cache_control block, text byte-identical', () => {
    const sys = `${STATIC}dynamic context`;
    const out = applyPromptCacheToBody({ model: 'openai/gpt-5.6-terra', messages: [{ role: 'developer', content: sys }, { role: 'user', content: 'היי' }] });
    const blocks = (out!.messages as Array<{ content: Array<{ text: string; cache_control?: unknown }> }>)[0]!.content;
    expect(blocks[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks.map((b) => b.text).join('')).toBe(sys);
    expect(blocks[1]!.cache_control).toBeUndefined();
  });
  it('leaves unregistered prompts and non-supporting models untouched', () => {
    expect(applyPromptCacheToBody({ model: 'openai/gpt-5.6-terra', messages: [{ role: 'system', content: 'other' }] })).toBeNull();
    expect(applyPromptCacheToBody({ model: 'x-ai/grok-4.5', messages: [{ role: 'system', content: `${STATIC}x` }] })).toBeNull();
  });
});

describe('long cache life + summary-backed history', () => {
  it('adds a 12h OpenAI breakpoint on openai/ models only', async () => {
    const sys = `${STATIC}dyn`;
    const o = applyPromptCacheToBody({ model: 'openai/gpt-5.6-terra', messages: [{ role: 'system', content: sys }] });
    expect((o!.messages as any)[0].content[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit', ttl: '12h' });
    const a = applyPromptCacheToBody({ model: 'anthropic/claude-sonnet-5', messages: [{ role: 'system', content: sys }] });
    expect((a!.messages as any)[0].content[0].prompt_cache_breakpoint).toBeUndefined();
  });
  it('keeps full history without a session summary, tail only with one', async () => {
    const { keepVerbatimTailWhenSummarized } = await import('../lib/ai/chat-memory/summary-backed-history');
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
    expect(keepVerbatimTailWhenSummarized(msgs, false)).toHaveLength(30);
    const t = keepVerbatimTailWhenSummarized(msgs, true, 16);
    expect(t[0]!.role).toBe('user');
    expect(t.at(-1)!.content).toBe('29');
    expect(t.length).toBeLessThanOrEqual(16);
  });
});
