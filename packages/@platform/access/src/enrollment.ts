/**
 * Device enrollment links (hidden admin): Gideon issues a one-time link; only a device that opened it and
 * registered a passkey may see the admin login. Pure helpers; the app stores sha256(token) only.
 */
export const ENROLL_TTL_MS = 10 * 60_000;
export const ENROLL_TOKEN_BYTES = 32;
export const ENROLL_MAX_OPEN_LINKS = 3;

export type EnrollmentRow = { id: string; tokenHash: string; expiresAt: number; usedAt: number | null; revokedAt: number | null };
export type EnrollCheck = { ok: true } | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'revoked' };

/** Token format: 43 base64url chars (32 bytes). Anything else is rejected before any DB lookup. */
export function wellFormedToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function checkEnrollment(row: EnrollmentRow | null | undefined, now: number): EnrollCheck {
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revokedAt != null) return { ok: false, reason: 'revoked' };
  if (row.usedAt != null) return { ok: false, reason: 'used' };
  if (!(now < row.expiresAt)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/** Telegram enrollment command, accepted only from an already verified owner id (checked by caller). */
export function isEnrollCommand(text: string | null | undefined): boolean {
  const t = (text ?? '').trim().toLowerCase();
  return t === '/newdevice' || t === 'מכשיר חדש' || t.startsWith('/newdevice@');
}

/** Number matching (anti-push-fatigue): device shows `n`, the approver gets 3 distinct 2-digit buttons in random order. */
export const MATCH_TTL_MS = 2 * 60_000;
export function matchOptions(n: number, rnd: () => number = Math.random): number[] {
  if (!Number.isInteger(n) || n < 10 || n > 99) throw new Error('match number out of range');
  const set = new Set<number>([n]);
  while (set.size < 3) set.add(10 + Math.floor(rnd() * 90));
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export type EnrollStage = 'opened' | 'factor_ok' | 'approved' | 'completed' | 'rejected' | 'expired';
export type EnrollState = { usedAt: number | null; revokedAt: number | null; expiresAt: number; factorOkAt: number | null; matchResult: 'approved' | 'wrong' | 'expired' | null; matchExpiresAt: number | null; matchDecidedAt: number | null; completedAt: number | null };
export const REGISTER_AFTER_APPROVAL_MS = 5 * 60_000;
/** Where a pending enrollment stands. A passkey may only be registered at stage 'approved'. */
export function enrollStage(s: EnrollState, now: number): EnrollStage {
  if (s.completedAt != null) return 'completed';
  if (s.revokedAt != null || s.matchResult === 'wrong') return 'rejected';
  if (s.matchResult === 'expired') return 'expired';
  if (s.matchResult === 'approved') return s.matchDecidedAt != null && now < s.matchDecidedAt + REGISTER_AFTER_APPROVAL_MS ? 'approved' : 'expired';
  if (!(now < s.expiresAt) && s.factorOkAt == null) return 'expired';
  if (s.factorOkAt != null) return s.matchExpiresAt != null && !(now < s.matchExpiresAt) ? 'expired' : 'factor_ok';
  return 'opened';
}
export function mayRegisterPasskey(s: EnrollState, now: number): boolean { return enrollStage(s, now) === 'approved'; }
