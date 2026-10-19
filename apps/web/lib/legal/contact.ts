/** Single source of truth for public legal/contact addresses.
 * Swap these when the full support system lands; pages and emails import from here.
 */
export const LEGAL_PRIVACY_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@nurawell.ai';
export const LEGAL_SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@nurawell.ai';
export const LEGAL_CONTROLLER_NAME = 'NuraWell';
