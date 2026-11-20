import { describe, expect, it, vi } from 'vitest';
import { blockedProviderResponse, estimateCallUsd, parentAiPurpose } from '@/lib/central/ai-controls';

describe('parent AI purpose and estimate (no secrets, no prompts sent)', () => {
  it('normalises a feature name and falls back to ai.other', () => {
    expect(parentAiPurpose('almog_task_merge')).toBe('almog_task_merge');
    expect(parentAiPurpose('Almog Chat')).toBe('almog_chat');
    expect(parentAiPurpose('')).toBe('ai.other');
    expect(parentAiPurpose('!!!')).toBe('ai.other');
  });
  it('estimates a conservative cost from message length without keeping the text', () => {
    const { estUsd, maxTokens, model } = estimateCallUsd({ model: 'openai/gpt-4o-mini', max_tokens: 100, messages: [{ role: 'user', content: 'a'.repeat(300) }] });
    expect(model).toBe('openai/gpt-4o-mini');
    expect(maxTokens).toBe(100);
    expect(estUsd).toBeGreaterThan(0);
    expect(estUsd).toBeLessThan(0.05);
  });
  it('returns a provider-shaped 403 when the parent blocks a run', async () => {
    const r = blockedProviderResponse('product_kill');
    expect(r.status).toBe(403);
    expect(r.headers.get('x-parent-ai-blocked')).toBe('product_kill');
    expect(await r.json()).toEqual({ error: { message: 'parent_ai_blocked', code: 'product_kill' } });
  });
});
