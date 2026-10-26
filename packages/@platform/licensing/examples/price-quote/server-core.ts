// Example module, SERVER half: the essential logic. Deployed only inside our shared Worker; never shipped to buyers.
import type { CoreFn } from '../../src/gateway';

type QuoteIn = { items: { qty: number; unitPrice: number }[]; coupon?: string };
/** Pricing rules are the "secret sauce" here: buyers can call them, never read or copy them. */
export const quote: CoreFn = (input) => {
  const i = input as QuoteIn;
  if (!i || !Array.isArray(i.items) || i.items.length > 200) throw new Error('bad input');
  const subtotal = i.items.reduce((s, x) => s + Math.max(0, Number(x.qty) || 0) * Math.max(0, Number(x.unitPrice) || 0), 0);
  const volume = subtotal >= 1000 ? 0.08 : subtotal >= 300 ? 0.03 : 0;
  const coupon = i.coupon === 'WELCOME' ? 0.05 : 0;
  const total = Math.round(subtotal * (1 - volume - coupon) * 100) / 100;
  return { subtotal, total };
};
export const priceQuoteCores = { quote };

// Worker entry (one shared Worker for all products/modules):
//   import { createCoreGateway, kvGatewayStore } from '@platform/licensing/gateway';
//   import { toHost } from '@platform/licensing/online';
//   export default { fetch: (req, env) => toHost('cloudflare', createCoreGateway({ store: kvGatewayStore(env.LICENSES), cores: { 'price-quote': priceQuoteCores } })).fetch(req) };
