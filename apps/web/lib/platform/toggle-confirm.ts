import { OWNED_BY_US } from './catalog';

/**
 * How a module enable/disable is re-confirmed, per product (= tenant).
 * - 'strict': fresh single-use approval from StepUpDialog purpose "ops.sensitive" (phone QR / passkey on an
 *   approved Ops device / TOTP / backup code). Our own products always use this.
 * - 'friendly': customer default. Passkey if enrolled, else authenticator code, else a one-time email code.
 *   Grants are bound to purpose "ops.modules", so they never unlock other sensitive actions.
 */
export type ToggleConfirmMode = 'strict' | 'friendly';
export const STRICT_PURPOSE = 'ops.sensitive';
export const FRIENDLY_PURPOSE = 'ops.modules';

/** Per-product opt-in. A customer may choose 'strict'; an owned product can never be downgraded. */
export const TOGGLE_CONFIRM: Record<string, ToggleConfirmMode> = {};

export function toggleConfirmMode(productId: string, cfg: Record<string, ToggleConfirmMode> = TOGGLE_CONFIRM, owned: Record<string, boolean> = OWNED_BY_US): ToggleConfirmMode {
  if (owned[productId]) return 'strict';
  return cfg[productId] === 'strict' ? 'strict' : 'friendly';
}

export const togglePurpose = (m: ToggleConfirmMode) => (m === 'strict' ? STRICT_PURPOSE : FRIENDLY_PURPOSE);

export type FriendlyMethod = 'passkey' | 'totp' | 'email';
/** Order offered to customers: passkey → authenticator code → email code. */
export function friendlyMethods(has: { passkeys: number; totp: boolean; webauthn: boolean }): FriendlyMethod[] {
  const out: FriendlyMethod[] = [];
  if (has.passkeys > 0 && has.webauthn) out.push('passkey');
  if (has.totp) out.push('totp');
  out.push('email');
  return out;
}

/**
 * Optional, config-driven upsell for our own security module, shown subtly only when the customer has no
 * strong method (no passkey, no authenticator). No vendor names in code; label/href come from config.
 * We never add extra security layers to the customer's site; this is only a link.
 */
export type SecurityUpsell = { label: string; href: string };
export const SECURITY_UPSELL: Record<string, SecurityUpsell> = {};

export function upsellFor(productId: string, has: { passkeys: number; totp: boolean }, cfg: Record<string, SecurityUpsell> = SECURITY_UPSELL, owned: Record<string, boolean> = OWNED_BY_US): SecurityUpsell | null {
  if (owned[productId] || has.passkeys > 0 || has.totp) return null;
  const u = cfg[productId];
  if (!u || typeof u.label !== 'string' || !/^[\p{L}\p{N} ,.'"!?:()-]{2,60}$/u.test(u.label)) return null;
  try { const url = new URL(u.href); if (url.protocol !== 'https:') return null; return { label: u.label, href: url.toString() }; } catch { return null; }
}
