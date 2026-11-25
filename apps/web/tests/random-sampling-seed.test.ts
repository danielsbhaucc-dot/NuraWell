import { afterEach, describe, expect, it, vi } from 'vitest';
import { RANDOM_SAMPLING_SEED_MAX, randomSamplingSeed } from '@/lib/ai/random-sampling-seed';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('randomSamplingSeed', () => {
  it('uses crypto.getRandomValues and never calls Math.random', () => {
    const mathSpy = vi.spyOn(Math, 'random');
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues');
    const seed = randomSamplingSeed();
    expect(mathSpy).not.toHaveBeenCalled();
    expect(cryptoSpy).toHaveBeenCalledTimes(1);
    expect(cryptoSpy.mock.calls[0]?.[0]).toBeInstanceOf(Uint32Array);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(RANDOM_SAMPLING_SEED_MAX);
  });

  it('maps the CSPRNG output into the OpenRouter seed range', () => {
    const mathSpy = vi.spyOn(Math, 'random');
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
      const typed = values as Uint32Array;
      typed[0] = RANDOM_SAMPLING_SEED_MAX + 7;
      return typed;
    });
    expect(randomSamplingSeed()).toBe(7);
    expect(mathSpy).not.toHaveBeenCalled();
  });
});
