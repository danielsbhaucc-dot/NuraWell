/**
 * security-privacy kit — one install gives every product the same security level.
 * Parts (import the subpath you need): ./headers ./rate-limit ./feed ./authz ./crypto (Node).
 * The kit reports its own name+version to the parent console in the daily security status.
 */
export const KIT = { name: 'security-privacy', version: '1.0.0' } as const;
export interface KitConfig {
  productId: string;
  /** Sellable use: the buyer's @core/licensing gate. Security kits fail SAFE — an inactive licence never turns protections off, it only disables the central adapter and is reported back. */
  licenseActive?: () => boolean | Promise<boolean>;
}
/** One init call per product (server start / config). Sets the crypto AAD namespace and returns the kit descriptor for the feed. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export async function initSecurityPrivacy(cfg: KitConfig) {
  const { setCryptoNamespace } = await import('./crypto');
  setCryptoNamespace(cfg.productId);
  const licensed = cfg.licenseActive ? await cfg.licenseActive() : true;
  if (!licensed) process.env.KIT_CENTRAL_REPORTING = 'off';
  return { licensed, kits: { [KIT.name]: KIT.version } };
}
