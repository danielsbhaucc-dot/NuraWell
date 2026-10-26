import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ipHash, ipHashCandidates } from '@/lib/platform/access/request-facts';

const keys = ['ACCESS_LOG_HASH_KEY', 'ACCESS_LOG_HASH_KEY_PREV', 'OPS_DEVICE_SECRET'] as const;
afterEach(() => { for (const k of keys) vi.unstubAllEnvs(); });

describe('ACCESS_LOG_HASH_KEY dual-key ip hash', () => {
  it('unset dedicated key: same as legacy, single candidate', () => {
    vi.stubEnv('ACCESS_LOG_HASH_KEY', ''); vi.stubEnv('ACCESS_LOG_HASH_KEY_PREV', ''); vi.stubEnv('OPS_DEVICE_SECRET', 'legacy');
    const legacy = ipHash('1.2.3.4');
    expect(ipHashCandidates('1.2.3.4')).toEqual([legacy]);
  });
  it('new key writes new hash, still verifies legacy-hashed rows', () => {
    vi.stubEnv('ACCESS_LOG_HASH_KEY', ''); vi.stubEnv('ACCESS_LOG_HASH_KEY_PREV', ''); vi.stubEnv('OPS_DEVICE_SECRET', 'legacy');
    const legacy = ipHash('1.2.3.4');
    vi.stubEnv('ACCESS_LOG_HASH_KEY', 'new-key');
    const cur = ipHash('1.2.3.4');
    expect(cur).not.toBe(legacy);
    expect(ipHashCandidates('1.2.3.4')).toEqual([cur, legacy]);
  });
  it('explicit PREV wins over legacy for rotation', () => {
    vi.stubEnv('ACCESS_LOG_HASH_KEY', 'k1'); vi.stubEnv('OPS_DEVICE_SECRET', 'legacy');
    const h1 = ipHash('5.6.7.8');
    vi.stubEnv('ACCESS_LOG_HASH_KEY', 'k2'); vi.stubEnv('ACCESS_LOG_HASH_KEY_PREV', 'k1');
    expect(ipHashCandidates('5.6.7.8')).toEqual([ipHash('5.6.7.8'), h1]);
    expect(ipHashCandidates('')).toEqual([]);
  });
});
