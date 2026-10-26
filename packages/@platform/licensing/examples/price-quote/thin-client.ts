// Example module, BUYER half: no pricing logic at all. Only signs the request and renders a Hebrew lock message.
import { createCoreClient, type CoreClientConfig } from '../../src/gateway';

export function priceQuoteClient(cfg: Omit<CoreClientConfig, 'moduleId'>) {
  const c = createCoreClient({ ...cfg, moduleId: 'price-quote' });
  return {
    /** Returns the quote, or { locked: message } that the host app shows as-is. Never throws. */
    async quote(items: { qty: number; unitPrice: number }[], coupon?: string) {
      const r = await c.call<{ subtotal: number; total: number }>('quote', { items, coupon });
      return r.ok ? { ok: true as const, ...r.data } : { ok: false as const, locked: r.message, code: r.code };
    },
  };
}
