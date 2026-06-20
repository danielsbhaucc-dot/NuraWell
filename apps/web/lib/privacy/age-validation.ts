import { ADULT_AGE, MIN_USER_AGE } from './constants';

export type AgeValidationResult =
  | { ok: true; age: number; requiresParentalConsent: boolean }
  | { ok: false; code: 'invalid_date' | 'too_young' | 'future_date' };

function parseBirthDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== trimmed) return null;
  return d;
}

export function calculateAge(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function validateBirthDate(raw: string, now = new Date()): AgeValidationResult {
  const birthDate = parseBirthDate(raw);
  if (!birthDate) return { ok: false, code: 'invalid_date' };
  if (birthDate.getTime() > now.getTime()) return { ok: false, code: 'future_date' };

  const age = calculateAge(birthDate, now);
  if (age < MIN_USER_AGE) return { ok: false, code: 'too_young' };

  return {
    ok: true,
    age,
    requiresParentalConsent: age >= MIN_USER_AGE && age < ADULT_AGE,
  };
}
