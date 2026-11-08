import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

  it('seals a birth date and still reads an older plain ISO value', async () => {
    const out = await sealProfilePatch({ date_of_birth: '1990-05-04', birth_date: '1981-02-03' }, U);
    expect(String(out.date_of_birth)).toMatch(/^enc:v2:/);
    expect(String(out.birth_date)).toMatch(/^enc:v2:/);
    expect(String(out.date_of_birth)).not.toContain('1990-05-04');
    const back = await read(out);
    expect(back.date_of_birth).toBe('1990-05-04');
    expect(back.birth_date).toBe('1981-02-03');
    expect((await read({ date_of_birth: '1990-05-04' })).date_of_birth).toBe('1990-05-04');
    expect((await read({ date_of_birth: out.date_of_birth }, U2)).date_of_birth).toBeNull();
  });

  it('a value bound to one user does not open for another', async () => {
    const out = await sealProfilePatch({ main_obstacle_detail: 'secret' }, U);
    const back = await read({ main_obstacle_detail: out.main_obstacle_detail }, U2);
    expect(back.main_obstacle_detail).toBeNull();
  });
});

describe('birth date migration keeps existing values', () => {
  it('converts DATE to text without deleting rows', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000233_profile_birth_dates_text.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/alter column date_of_birth type text using to_char\(date_of_birth, 'YYYY-MM-DD'\)/);
    expect(sql).toMatch(/alter column birth_date type text using to_char\(birth_date, 'YYYY-MM-DD'\)/);
    const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase();
    expect(statements).not.toMatch(/\bdelete\b|\bdrop column\b|\btruncate\b/);
    const action = readFileSync(new URL('../lib/actions/complete-onboarding.ts', import.meta.url), 'utf8');
    expect(action).not.toMatch(/console\.(log|info|warn|error)\([^)]*date_of_birth/);
  });
});
