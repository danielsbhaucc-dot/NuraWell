import type { License } from './license';

/**
 * "Powered by" credit for embeddable/sellable modules. Shown by default; hidden ONLY when a verified,
 * unexpired license carries the paid 'white_label' feature. Any doubt (no license, bad brand config,
 * verification failure) => credit shown (fail closed). The brand is the parent company's public brand,
 * passed in by config; never a person's name.
 */
export const WHITE_LABEL_FEATURE = 'white_label';
export type CreditBrand = { name: string; url: string };
export type Credit = { text: string; brand: string; href: string; rel: 'nofollow noopener'; dir: 'rtl'; lang: 'he' };

export function validateBrand(b: CreditBrand | null | undefined): CreditBrand {
  if (!b || typeof b.name !== 'string' || !/^[\p{L}\p{N} .&'-]{2,40}$/u.test(b.name.trim())) throw new Error('credit brand name invalid');
  let u: URL;
  try { u = new URL(b.url); } catch { throw new Error('credit brand url invalid'); }
  if (u.protocol !== 'https:') throw new Error('credit brand url must be https');
  return { name: b.name.trim(), url: u.toString() };
}

/** `license` must already be signature-verified and in its paid period by the caller (server-side). */
export function hasFeature(license: License | null | undefined, feature: string, now = new Date()): boolean {
  if (!license || !Array.isArray(license.features) || !license.features.includes(feature)) return false;
  if (license.expiresAt === null) return license.mode === 'source';
  const end = Date.parse(license.expiresAt);
  return Number.isFinite(end) && end > now.getTime();
}

export function creditFor(brand: CreditBrand, license: License | null | undefined, now = new Date()): Credit | null {
  const b = validateBrand(brand);
  if (hasFeature(license, WHITE_LABEL_FEATURE, now)) return null;
  return { text: `מופעל על ידי ${b.name}`, brand: b.name, href: b.url, rel: 'nofollow noopener', dir: 'rtl', lang: 'he' };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Small, tasteful HTML snippet for non-React embeds. Inline styles only (no host CSS leakage). */
export function creditHtml(c: Credit | null): string {
  if (!c) return '';
  return `<p class="pc-credit" dir="rtl" lang="he" style="margin:8px 0 0;font:500 11px/1.4 system-ui,sans-serif;color:#3a4a43;text-align:start">`
    + `<a href="${esc(c.href)}" target="_blank" rel="${c.rel}" style="color:#0b3326;text-decoration:underline;text-underline-offset:2px">${esc(c.text)}</a></p>`;
}
