import { describe, expect, it } from 'vitest';

import {
  buildDeterministicSosFallback,
  buildSosInterventionFromPivot,
  buildSosSlowDownMessage,
  normalizeSosTrigger,
  SOS_DAILY_SOFT_LIMIT,
  withTimeout,
} from '../lib/ai/guardian/sos';

describe('sos helpers', () => {
  it('maps quick-button triggers to friction categories', () => {
    expect(normalizeSosTrigger('לחוץ')).toBe('emotional');
    expect(normalizeSosTrigger('משעמם')).toBe('motivational');
    expect(normalizeSosTrigger('סתם מתחשק')).toBe('physiological');
    expect(normalizeSosTrigger(undefined)).toBe('emotional');
  });

  it('builds a deterministic, non-restrictive fallback', () => {
    const fallback = buildDeterministicSosFallback('emotional');
    expect(fallback.used_fallback).toBe(true);
    expect(fallback.message.length).toBeGreaterThan(0);
    expect(fallback.micro_step.length).toBeGreaterThan(0);
    expect(fallback.message).not.toMatch(/אל תאכל|תתאפק|דיאטה/);
  });

  it('slow-down message points to a human resource', () => {
    const slow = buildSosSlowDownMessage();
    expect(slow.message).toContain('1201');
    expect(SOS_DAILY_SOFT_LIMIT).toBe(6);
  });

  it('builds an intervention from an LLM pivot result', () => {
    const intervention = buildSosInterventionFromPivot({
      category: 'emotional',
      empathy: 'אני שומע אותך',
      proposal: {
        label: 'דקת אוויר',
        strategy_type: 'emotional_regulation',
        micro_step: 'ניקח שלוש נשימות',
        relation: 'supports',
      },
      relatesToRef: null,
    });
    expect(intervention.used_fallback).toBe(false);
    expect(intervention.message).toContain('אני שומע אותך');
    expect(intervention.message).toContain('ניקח שלוש נשימות');
  });

  it('withTimeout rejects slow promises with SOS_LLM_TIMEOUT', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 10)).rejects.toThrow('SOS_LLM_TIMEOUT');
  });

  it('withTimeout resolves fast promises', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });
});
