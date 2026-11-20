/**
 * "המנוי שלי" when billing lives in the parent account (BILLING_PLATFORM_ENABLED off).
 * The parent handles identity and payment; NuraWell only reads the signed license verdict for the
 * license id on the session (app_metadata.pl_lic, server-written) and links to the parent account
 * area for every money action (renew, cancel, invoices). No card data and no billing writes here.
 */
export type SubscriptionState = 'active' | 'none' | 'expired' | 'suspended' | 'revoked' | 'unknown' | 'staff';
export type SubscriptionTone = 'ok' | 'warn' | 'bad';

export type SubscriptionView = {
  state: SubscriptionState;
  tone: SubscriptionTone;
  /** Parent account area: manage, renew, cancel. Null when the parent site is not configured. */
  manageUrl: string | null;
  /** Parent purchase page for this product. Shown only when there is no live subscription. */
  buyUrl: string | null;
};

const HTTPS = /^https:\/\/[a-z0-9.-]+(\/[\w./?=&%-]*)?$/i;

/** Parent account area on the same origin as the configured purchase page. */
export function manageUrlFrom(purchaseUrl: string | null | undefined): string | null {
  if (!purchaseUrl || !HTTPS.test(purchaseUrl)) return null;
  try {
    return new URL('/account/area/', purchaseUrl).toString();
  } catch {
    return null;
  }
}

/** Pure mapping from the license verdict reason to what the member sees. */
export function stateFromReason(reason: string | null | undefined, opts: { hasLicense: boolean; isStaff: boolean }): SubscriptionState {
  if (opts.isStaff) return 'staff';
  if (reason === 'active') return 'active';
  if (reason === 'expired') return 'expired';
  if (reason === 'suspended') return 'suspended';
  if (reason === 'revoked' || reason === 'wrong_product') return 'revoked';
  if (!opts.hasLicense || reason === 'no_license' || reason === 'unknown_license') return 'none';
  return 'unknown'; // no_status / stale_status / anything new: never claim a state we did not verify
}

const TONE: Record<SubscriptionState, SubscriptionTone> = {
  active: 'ok', staff: 'ok', none: 'warn', unknown: 'warn', expired: 'bad', suspended: 'bad', revoked: 'bad',
};

export function buildSubscriptionView(p: { reason: string | null; hasLicense: boolean; isStaff: boolean; purchaseUrl: string | null }): SubscriptionView {
  const state = stateFromReason(p.reason, p);
  const buyable = state === 'none' || state === 'expired';
  const buyUrl = buyable && p.purchaseUrl && HTTPS.test(p.purchaseUrl) ? p.purchaseUrl : null;
  return { state, tone: TONE[state], manageUrl: state === 'staff' ? null : manageUrlFrom(p.purchaseUrl), buyUrl };
}

export const LIC_ID = /^[A-Za-z0-9_~-]{6,80}$/;
