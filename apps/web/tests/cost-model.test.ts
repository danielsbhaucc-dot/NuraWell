import { describe, expect, it } from 'vitest';

import {
  computeChatCostUsd,
  estimateChatBackgroundUsd,
  resolveModelPricing,
} from '../lib/admin/cost-model';

describe('resolveModelPricing', () => {
  it('prices Claude Sonnet 5 at $2/$10, not the 4.6 table', () => {
    const p = resolveModelPricing('anthropic/claude-sonnet-5');
    expect(p.input).toBe(2);
    expect(p.output).toBe(10);
    expect(p.cachedInput).toBe(0.2);
    expect(p.cacheWrite).toBe(4);
  });

  it('keeps older Sonnet on the 4.x table', () => {
    const p = resolveModelPricing('anthropic/claude-sonnet-4.6');
    expect(p.input).toBe(3);
    expect(p.output).toBe(15);
  });

  it('prices GPT-5.6 Terra at OpenRouter list', () => {
    const p = resolveModelPricing('openai/gpt-5.6-terra');
    expect(p.input).toBe(2.5);
    expect(p.output).toBe(15);
  });

  it('prices Llama 4 Maverick above Groq Scout', () => {
    const m = resolveModelPricing('meta-llama/llama-4-maverick');
    const s = resolveModelPricing('meta-llama/llama-4-scout');
    expect(m.input).toBe(0.2);
    expect(m.output).toBe(0.7);
    expect(s.input).toBe(0.11);
    expect(s.output).toBe(0.34);
  });

  it('uses Grok cache-read discount', () => {
    const p = resolveModelPricing('x-ai/grok-4.5');
    expect(p.input).toBe(2);
    expect(p.cachedInput).toBe(0.3);
    expect(p.output).toBe(6);
  });
});

describe('computeChatCostUsd', () => {
  it('bills 1M fresh Sonnet 5 tokens at list price', () => {
    const usd = computeChatCostUsd('anthropic/claude-sonnet-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(12, 6);
  });

  it('prefers inputTokens over total-output when both exist', () => {
    const usd = computeChatCostUsd('openai/gpt-5.6-terra', {
      totalTokens: 100,
      inputTokens: 80,
      outputTokens: 20,
    });
    expect(usd).toBeCloseTo((80 * 2.5 + 20 * 15) / 1_000_000, 10);
  });
});

describe('estimateChatBackgroundUsd', () => {
  it('scales with assistant turns', () => {
    const one = estimateChatBackgroundUsd(1);
    const ten = estimateChatBackgroundUsd(10);
    expect(one).toBeGreaterThan(0);
    expect(ten).toBeCloseTo(one * 10, 10);
  });
});
