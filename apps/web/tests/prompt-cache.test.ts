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
