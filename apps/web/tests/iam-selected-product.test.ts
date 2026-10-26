import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ALL_PRODUCTS, FOUNDER_ROLE, decide, type Actor } from '@platform/iam';
import { selectedProduct } from '@/lib/platform/authorize';
import { CATALOG, DEFAULT_PRODUCT, PRODUCT_COOKIE } from '@/lib/platform/catalog';

const req = (cookie: string) => new Request('https://x.test/api/v1/ops/x', { headers: { cookie: `${PRODUCT_COOKIE}=${encodeURIComponent(cookie)}` } });
const actor = (roleId: string, productId: string): Actor => ({ userId: 'u', kind: 'human', grants: [{ userId: 'u', roleId, productId, expiresAt: null, revokedAt: null }] });

describe("selectedProduct: founder 'all products' cookie", () => {
  it("'*' falls back to the default product (not unknown_product)", () => {
    expect(selectedProduct(req(ALL_PRODUCTS))).toBe(DEFAULT_PRODUCT);
  });
  it('the grant is still verified after the fallback', () => {
    const p = selectedProduct(req(ALL_PRODUCTS));
    expect(decide(CATALOG, actor(FOUNDER_ROLE, ALL_PRODUCTS), p, 'admin.access', { steppedUp: true }).allow).toBe(true);
    expect(decide(CATALOG, { userId: 'n', kind: 'human', grants: [] }, p, 'admin.access', { steppedUp: true }).allow).toBe(false);
    expect(decide(CATALOG, actor('invest.owner', 'invest'), p, 'admin.access', { steppedUp: true }).allow).toBe(false);
  });
  it('garbage values still fail closed', () => {
    expect(selectedProduct(req('**'))).toBe('');
    expect(selectedProduct(req('../x'))).toBe('');
  });
});
