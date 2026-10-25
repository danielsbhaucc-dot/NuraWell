import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertProfileEnums, ProfileEnumError, PROFILE_ENUMS } from '@/lib/security/profile-enums';
import { BLOCKED } from '@/lib/security/field-registry';

describe('profile enums validated app-side', () => {
  it('accepts allowed values, null and absent', () => {
    expect(() => assertProfileEnums({ gender: 'female', main_goal: 'both', main_obstacle: null, weakest_time_of_day: 'noon', activity_level: 'light' })).not.toThrow();
    expect(() => assertProfileEnums({ full_name: 'x' })).not.toThrow();
  });
  it('rejects anything else', () => {
    for (const col of Object.keys(PROFILE_ENUMS)) {
      expect(() => assertProfileEnums({ [col]: 'nope' })).toThrow(ProfileEnumError);
      expect(() => assertProfileEnums({ [col]: 5 })).toThrow(ProfileEnumError);
    }
  });
  it('matches the dropped DB constraints and is wired into sealProfilePatch', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000184_profiles_enum_checks_app_side.sql', import.meta.url), 'utf8');
    for (const col of Object.keys(PROFILE_ENUMS)) expect(sql).toContain(`profiles_${col}_check`);
    const seal = readFileSync(new URL('../lib/crypto/pii-seal.ts', import.meta.url), 'utf8');
    expect(seal).toMatch(/assertProfileEnums\(patch\);/);
  });
  it('profile enum columns and phone are no longer blocked', () => {
    for (const c of [...Object.keys(PROFILE_ENUMS), 'phone']) expect(`profiles.${c}` in BLOCKED).toBe(false);
  });
});
