import { describe, expect, it } from 'vitest';
import { withTimeoutFetch } from '../lib/ai/provider-factory';

describe('withTimeoutFetch', () => {
  it('aborts slow requests', async () => {
    const slow: typeof fetch = (_i, init) =>
      new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(withTimeoutFetch(slow, 20)('http://x')).rejects.toThrow();
  });
  it('passes through when no timeout', async () => {
    const ok: typeof fetch = async () => new Response('ok');
    expect(withTimeoutFetch(ok, null)).toBe(ok);
    expect(await (await withTimeoutFetch(ok, 1000)('http://x')).text()).toBe('ok');
  });
});
