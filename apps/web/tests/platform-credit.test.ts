import { describe, expect, it } from 'vitest';
import { creditFor, creditHtml, generateSigningKeyPair, hasFeature, issueLicense, verifyLicense, WHITE_LABEL_FEATURE } from '@platform/licensing';

const BRAND = { name: 'Example Labs', url: 'https://example.com/' };
const kp = generateSigningKeyPair();
const lic = (features?: string[], validDays = 30) => issueLicense(kp.privatePem, { moduleId: 'a11y', versionRange: '^1.0.0', licensee: { id: 'c1', name: 'Customer' }, domains: ['shop.example'], mode: 'bundle', validDays, features }).token;
const verified = (t: string, now?: Date) => {
  const r = verifyLicense(t, kp.publicPem, { moduleId: 'a11y', version: '1.0.0', host: 'shop.example', now });
  return r.ok ? r.license : null;
};

describe('powered-by credit', () => {
  it('is shown by default (no license, license without the feature)', () => {
    expect(creditFor(BRAND, null)?.text).toBe('מופעל על ידי Example Labs');
    const plain = verified(lic());
    expect(plain).not.toBeNull();
    expect(creditFor(BRAND, plain)).not.toBeNull();
  });
  it('is hidden only with a verified, unexpired white_label entitlement', () => {
    const l = verified(lic([WHITE_LABEL_FEATURE]));
    expect(l?.features).toEqual(['white_label']);
    expect(creditFor(BRAND, l)).toBeNull();
    expect(hasFeature(l, WHITE_LABEL_FEATURE, new Date(Date.now() + 40 * 864e5))).toBe(false); // expired => shown
  });
  it('a tampered token cannot remove the credit', () => {
    const t = lic();
    const [p, body, sig] = t.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
    forged.features = ['white_label'];
    expect(verified([p, Buffer.from(JSON.stringify(forged)).toString('base64url'), sig].join('.'))).toBeNull();
  });
  it('link is nofollow noopener, Hebrew RTL, escaped', () => {
    const h = creditHtml(creditFor({ name: 'A&B Labs', url: 'https://example.com/?x="1"' }, null));
    expect(h).toContain('rel="nofollow noopener"');
    expect(h).toContain('dir="rtl"');
    expect(h).toContain('lang="he"');
    expect(h).toContain('A&#38;B');
    expect(h).not.toContain('"1"');
    expect(creditHtml(null)).toBe('');
  });
  it('rejects unsafe brand config (fail closed at config time)', () => {
    expect(() => creditFor({ name: '<script>', url: 'https://x.y' }, null)).toThrow();
    expect(() => creditFor({ name: 'Labs', url: 'http://x.y' }, null)).toThrow();
    expect(() => creditFor({ name: 'Labs', url: 'javascript:alert(1)' }, null)).toThrow();
  });
});
