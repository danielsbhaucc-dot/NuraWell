/**
 * דגלי Guardian — ברירת מחדל: **פעיל**.
 * כיבוי מפורש בלבד: `GUARDIAN_FINGERPRINT_ENABLED=0` / `GUARDIAN_PROACTIVE_ENABLED=0`.
 * `GUARDIAN_KILL_SWITCH=1` — עוצר רק מגע יזום (לא SOS).
 */

export function isGuardianFingerprintEnabled(): boolean {
  return process.env.GUARDIAN_FINGERPRINT_ENABLED?.trim() !== '0';
}

export function isGuardianProactiveEnabled(): boolean {
  if (process.env.GUARDIAN_KILL_SWITCH === '1') return false;
  return process.env.GUARDIAN_PROACTIVE_ENABLED?.trim() !== '0';
}
