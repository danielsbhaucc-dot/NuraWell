import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { __resetPiiKeyCache, isEncrypted } from '@/lib/crypto/pii';
import {
  decInteractionResult,
  decProfileResult,
  decryptMeasurementRow,
  decryptProfileRow,
  encryptChatContent,
  encryptMeasurementPatch,
  encryptProfilePatch,
} from '@/lib/crypto/pii-fields';
import { restorePiiPlaceholders } from '@/lib/ai/insert-ai-interaction';

const U = '33333333-3333-3333-3333-333333333333';

describe('pii fields', () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetPiiKeyCache();
  });

  it('encrypts sensitive profile fields only and decrypts numbers back to numbers', () => {
    const patch = encryptProfilePatch(
      { full_name: 'דנה', current_weight_kg: 84.5, goal_weight_kg: 78, height_cm: null, health_conditions: ['x'], main_obstacle_detail: 'לילה' },
      U
    );
    expect(patch.full_name).toBe('דנה');
    expect(isEncrypted(patch.current_weight_kg)).toBe(true);
    expect(isEncrypted(patch.health_conditions)).toBe(true);
    expect(isEncrypted(patch.main_obstacle_detail)).toBe(true);
    expect(patch.height_cm).toBeNull();
    const back = decryptProfileRow({ id: U, ...patch });
    expect(back.current_weight_kg).toBe(84.5);
    expect(back.goal_weight_kg).toBe(78);
    expect(back.health_conditions).toEqual(['x']);
    expect(back.main_obstacle_detail).toBe('לילה');
  });

  it('reads legacy plaintext (numeric strings from text columns)', () => {
    expect(decryptProfileRow({ id: U, current_weight_kg: '80' }).current_weight_kg).toBe(80);
    expect(decryptProfileRow({ id: U, current_weight_kg: 80 }).current_weight_kg).toBe(80);
  });

  it('round-trips measurements', () => {
    const p = encryptMeasurementPatch({ user_id: U, weight_kg: 81.2, notes: 'מצ׳אט', measured_at: '2026-10-15' }, U);
    expect(isEncrypted(p.weight_kg)).toBe(true);
    expect(p.measured_at).toBe('2026-10-15');
    expect(decryptMeasurementRow(p).weight_kg).toBe(81.2);
  });

  it('decrypts query results (single + list)', () => {
    const enc = encryptProfilePatch({ current_weight_kg: 70 }, U);
    expect(decProfileResult(U)({ data: enc, error: null }).data).toEqual({ current_weight_kg: 70 });
    const rows = [{ user_id: U, content: encryptChatContent('שלום', U) }];
    expect(decInteractionResult()({ data: rows, error: null }).data).toEqual([{ user_id: U, content: 'שלום' }]);
    expect(decProfileResult(U)({ data: null, error: null }).data).toBeNull();
  });

  it('restores name placeholders in app code (DB trigger cannot see ciphertext)', () => {
    expect(restorePiiPlaceholders('היי [[USER_FIRST_NAME]] , מה נשמע?', 'נועה')).toBe('היי נועה, מה נשמע?');
    expect(restorePiiPlaceholders('כתוב ל [[EMAIL]] .', null)).toBe('כתוב ל.');
  });
});
