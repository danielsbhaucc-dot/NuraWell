/**
 * Allowed values for profile enum columns. These used to be DB CHECK constraints; the columns are now
 * encrypted per user, so the app enforces them on the plaintext before sealing (sealProfilePatch).
 */
export const PROFILE_ENUMS = {
  gender: ['male', 'female', 'other', 'prefer_not_to_say'],
  activity_level: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
  main_goal: ['weight_loss', 'healthy_lifestyle', 'both'],
  main_obstacle: ['no_time', 'emotional_eating', 'lack_of_consistency', 'no_support', 'other'],
  weakest_time_of_day: ['morning', 'noon', 'afternoon', 'evening_night'],
} as const satisfies Record<string, readonly string[]>;

export class ProfileEnumError extends Error {
  constructor(public readonly column: string) {
    super(`profiles.${column}: value not allowed`);
    this.name = 'ProfileEnumError';
  }
}

/** Throws ProfileEnumError when a present, non-null enum column holds a value outside its allowed set. */
export function assertProfileEnums(patch: Record<string, unknown>): void {
  for (const [col, allowed] of Object.entries(PROFILE_ENUMS)) {
    if (!(col in patch)) continue;
    const v = patch[col];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.startsWith('enc:')) continue; // already sealed upstream (validated there)
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new ProfileEnumError(col);
  }
}
