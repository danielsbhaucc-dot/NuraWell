import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/privacy/health-consent', async (orig) => ({
  ...(await orig<typeof import('@/lib/privacy/health-consent')>()),
  healthConsentStatus: async () => 'granted',
}));

import { __resetFieldCrypto, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { encryptProfilePatch, decProfileResult } from '@/lib/crypto/pii-fields';
import { sealProfilePatch, __setFirstNameLookup } from '@/lib/crypto/pii-seal';

const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
  __setFirstNameLookup(async () => 'נועה');
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prevKey; __setFirstNameLookup(null); });

const read = (row: Record<string, unknown>, uid = U) => decProfileResult(uid)({ data: { id: uid, ...row } }).then((r) => r.data as Record<string, unknown>);

describe('sealProfilePatch writes enc:v2', () => {
  it('seals the v1 column set as v2 and readers round-trip', async () => {
    const patch = {
      current_weight_kg: 72.5,
      health_conditions: ['x'],
      main_obstacle_detail: 'ערב',
      ai_context: { tone: 'warm', reengagement: { n: 1 } },
      onboarding_completed: true,
    };
    const out = await sealProfilePatch(patch, U);
    for (const c of ['current_weight_kg', 'health_conditions', 'main_obstacle_detail', 'ai_context']) {
      expect(String(out[c as keyof typeof out])).toMatch(/^enc:v2:/);
    }
    expect(out.onboarding_completed).toBe(true);
    const back = await read(out);
    expect(back.current_weight_kg).toBe(72.5);
    expect(back.health_conditions).toEqual(['x']);
    expect(back.main_obstacle_detail).toBe('ערב');
    expect(back.ai_context).toEqual(patch.ai_context);
  });

  it('upgrades legacy v1 values in the patch to v2 without double-wrapping', async () => {
    const v1 = encryptProfilePatch({ goal_weight_kg: 65, ai_system_prompt: 'p' }, U);
    expect(String(v1.goal_weight_kg)).toMatch(/^enc:v1:/);
    const out = await sealProfilePatch(v1, U);
    expect(String(out.goal_weight_kg)).toMatch(/^enc:v2:/);
    const back = await read(out);
    expect(back.goal_weight_kg).toBe(65);
    expect(back.ai_system_prompt).toBe('p');
  });

  it('still reads existing v1 rows and plaintext (dual-read)', async () => {
    const v1 = encryptProfilePatch({ height_cm: 170 }, U);
    expect((await read({ ...v1, gender: 'female' })).height_cm).toBe(170);
    expect((await read({ height_cm: 170 })).height_cm).toBe(170);
  });

  it('a value bound to one user does not open for another', async () => {
    const out = await sealProfilePatch({ main_obstacle_detail: 'secret' }, U);
    const back = await read({ main_obstacle_detail: out.main_obstacle_detail }, U2);
    expect(back.main_obstacle_detail).toBeNull();
  });
});
