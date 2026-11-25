/**
 * Random sampling seed for each OpenRouter request.
 * Some Llama providers on OpenRouter sample with a fixed default seed, so the
 * same input returns the exact same reply even at a high temperature. A fresh
 * seed breaks that determinism. It affects sampling only, not the prompt-cache
 * key, so caching is unchanged.
 *
 * Uses the Web Crypto CSPRNG, not Math.random.
 */
const SAMPLING_SEED_MAX = 2_000_000_000;

export const randomSamplingSeed = (): number => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % SAMPLING_SEED_MAX;
};

export const RANDOM_SAMPLING_SEED_MAX = SAMPLING_SEED_MAX;
