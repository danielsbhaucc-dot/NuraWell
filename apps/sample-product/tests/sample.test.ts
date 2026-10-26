import { describe, expect, it } from 'vitest';
import { createMemoryCostSink, createMockProvider } from '@platform/ai-engine';
import { memoryAuthAdapter } from '@platform/auth';
import { DEMO_USER, PRODUCT_ID, makeAuth, makeEngine, pickProvider } from '@/lib/platform';

describe('sample product on the shared platform', () => {
  it('defaults to the free mock provider', () => {
    expect(pickProvider({}).id).toBe('mock');
    expect(pickProvider({ SAMPLE_AI_PROVIDER: 'live' }).id).toBe('mock'); // no key → still mock
  });
  it('AI calls are attributed to the sample product', async () => {
    const sink = createMemoryCostSink();
    await makeEngine({ provider: createMockProvider(), costSink: sink }).ask([{ role: 'user', content: 'שלום' }], { feature: 'sample.ask', userRef: DEMO_USER.id });
    expect(sink.events[0]).toMatchObject({ productId: PRODUCT_ID, feature: 'sample.ask' });
    expect(sink.totalUsd()).toBe(0);
  });
  it('requires membership in this product (fails closed)', async () => {
    const outsider = makeAuth(memoryAuthAdapter({ id: 'x', email: null }, [{ userId: 'x', productId: 'nurawell' }]));
    await expect(outsider.requireUser()).rejects.toMatchObject({ code: 'not_member' });
    await expect(makeAuth().requireUser()).resolves.toMatchObject({ id: DEMO_USER.id });
  });
});
