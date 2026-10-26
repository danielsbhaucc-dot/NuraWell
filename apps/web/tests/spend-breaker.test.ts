import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetBreaker, checkSpendBreaker, isInteractiveFeature } from '@/lib/ai/spend-breaker';

vi.mock('@/lib/ceo/stepup-http', () => ({ alertOwner: vi.fn(async () => {}) }));

function mockSpend(usd: number | 'fail') {
  globalThis.fetch = vi.fn(async () => (usd === 'fail' ? new Response('x', { status: 500 }) : new Response(JSON.stringify([{ cost_usd: usd }]), { status: 200 }))) as typeof fetch;
}

describe('spend breaker', () => {
  const real = globalThis.fetch;
  beforeEach(() => {
    _resetBreaker();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
    delete process.env.AI_SPEND_BREAKER;
  });
  afterEach(() => { globalThis.fetch = real; });

  it('classifies chat as interactive and crons as background', () => {
    expect(isInteractiveFeature('chat')).toBe(true);
    expect(isInteractiveFeature('cron:memory-pipeline')).toBe(false);
    expect(isInteractiveFeature(undefined)).toBe(false);
  });
  it('allows everything under the background cap', async () => {
    mockSpend(0.1);
    expect(await checkSpendBreaker('cron:memory-pipeline')).toBeNull();
  });
  it('blocks background but not chat above the background cap', async () => {
    mockSpend(0.8);
    expect((await checkSpendBreaker('gideon_digest'))?.status).toBe(429);
    expect(await checkSpendBreaker('chat')).toBeNull();
  });
  it('blocks chat above the hard cap', async () => {
    mockSpend(6);
    expect((await checkSpendBreaker('chat'))?.status).toBe(429);
  });
  it('fails open when spend is unreadable', async () => {
    mockSpend('fail');
    expect(await checkSpendBreaker('cron:x')).toBeNull();
  });
  it('can be switched off', async () => {
    process.env.AI_SPEND_BREAKER = 'off';
    mockSpend(100);
    expect(await checkSpendBreaker('chat')).toBeNull();
  });
});
