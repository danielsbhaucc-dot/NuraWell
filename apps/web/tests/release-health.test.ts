import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

afterEach(() => { vi.unstubAllEnvs(); });

describe('/api/health', () => {
  it('reports the Vercel deployment id (without dpl_) as the version, uncached', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_3HiizRkboS6L9PiPfHTFpzCFV5Fu');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '0123456789abcdef0123');
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, product: 'nurawell', version: '3HiizRkboS6L9PiPfHTFpzCFV5Fu', sha: '0123456789ab' });
  });
  it('falls back to the commit, then to local; version always fits the parent release format', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'f'.repeat(40));
    expect((await GET().json()).version).toBe('f'.repeat(12));
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    expect((await GET().json()).version).toBe('local');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_' + 'x_'.repeat(40));
    const v = (await GET().json()).version;
    expect(v).toMatch(/^[0-9A-Za-z.+-]{1,40}$/);
  });
});
