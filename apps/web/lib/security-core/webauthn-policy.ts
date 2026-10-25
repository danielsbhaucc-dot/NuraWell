/**
 * Product-agnostic WebAuthn policy for *admin* hardware security keys (no app imports).
 * - Registration asks for a roaming (cross-platform) authenticator with user verification (PIN / touch + PIN).
 * - Only device-bound credentials are accepted: a synced passkey can roam to another device, so it is not a
 *   second factor that proves physical possession. (credentialDeviceType 'singleDevice' and not backed up.)
 * - Sign-in requires user verification and a non-decreasing signature counter (clone detection; 0/0 allowed,
 *   many keys never increment).
 */
export const ADMIN_KEY_MAX = 5;
export const ADMIN_KEY_TIMEOUT_MS = 120_000;

export type RegistrationPolicy = {
  authenticatorSelection: { authenticatorAttachment: 'cross-platform'; residentKey: 'discouraged'; userVerification: 'required' };
  attestationType: 'none';
  timeout: number;
};
export function adminKeyRegistrationPolicy(): RegistrationPolicy {
  return { authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'discouraged', userVerification: 'required' }, attestationType: 'none', timeout: ADMIN_KEY_TIMEOUT_MS };
}

export type RegisteredInfo = { credentialDeviceType: 'singleDevice' | 'multiDevice'; credentialBackedUp: boolean; userVerified: boolean };
export function acceptAdminKey(i: RegisteredInfo): { ok: true } | { ok: false; reason: 'synced' | 'no_uv' } {
  if (!i.userVerified) return { ok: false, reason: 'no_uv' };
  if (i.credentialDeviceType !== 'singleDevice' || i.credentialBackedUp) return { ok: false, reason: 'synced' };
  return { ok: true };
}

export function counterOk(stored: number, received: number): boolean {
  if (stored === 0 && received === 0) return true;
  return received > stored;
}

export function keyLimitReached(active: number): boolean { return active >= ADMIN_KEY_MAX; }
