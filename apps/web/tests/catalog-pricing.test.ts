import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseCatalog } from '@/lib/billing/catalog-parse';
import { CATALOG_TTL_MS, __resetCatalogCache, catalogUrl, fetchCatalogPricing, getCatalogPricing } from '@/lib/billing/catalog';
import { fallbackPricing, withoutExpiredPromos, RECOMMENDED_PLAN, type CatalogPricing } from '@/lib/billing/plans';
import { PlansGrid, promoBanner, shekels } from '@/components/billing/PlansGrid';

const NOW = new Date('2026-11-21T08:00:00Z');
const promoOn = { enabled: true, type: 'percent', value: 40, months: 3, endsAt: null };
const promoOff = { enabled: false, type: 'percent', value: 40, months: 3, endsAt: null };
const plan = (id: string, priceMinor: number, finalMinor: number | undefined, promo: unknown, extra: Record<string, unknown> = {}) => ({
  id, name: id, priceMinor, currency: 'ILS', ...(finalMinor === undefined ? {} : { finalMinor }), ...(promo === undefined ? {} : { promo }), ...extra,
});
const payload = (plans: unknown[]) => ({ product: 'nurawell', updatedAt: '2026-11-21T07:00:00Z', plans });
const live = payload([plan('basic', 17900, 10740, promoOn), plan('whatsapp', 19900, 11940, promoOn), plan('phone', 44900, 26940, promoOn)]);
const render = (pricing: CatalogPricing) => renderToStaticMarkup(createElement(PlansGrid, { purchaseBase: 'https://platform-core-preview.vercel.app/products/nurawell/', pricing }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('central catalog adapter', () => {
  it('parses the contract: base and final prices as sent, promo months, phone → premium', () => {
    const c = parseCatalog(live, NOW)!;
    expect(c.source).toBe('catalog');
    expect(c.plans.basic).toMatchObject({ fullMinor: 17900, finalMinor: 10740, promo: { type: 'percent', value: 40, months: 3 } });
    expect(c.plans.premium).toMatchObject({ fullMinor: 44900, finalMinor: 26940 });
    expect(c.recommended).toBe(RECOMMENDED_PLAN);
  });

  it('invalid payloads return null (caller falls back): wrong product, currency, final > base, flag mismatch, dupes, junk', () => {
    const bad: unknown[] = [
      null, 'x', {}, payload([]),
      { ...live, product: 'other' },
      payload([plan('basic', 17900, 10740, promoOn, { currency: 'USD' })]),
      payload([plan('basic', 17900, 18000, promoOff)]),
      payload([plan('basic', 17900, 10740, promoOff)]), // discounted while promo says off
      payload([plan('basic', 17900, 17900, promoOn)]), // promo on but no discount
      payload([plan('basic', 17900, 10740, promoOn), plan('basic', 17900, 10740, promoOn)]),
      payload([plan('gold', 17900, 10740, promoOn)]),
      payload([plan('basic', 17900.5, 10740, promoOn)]),
      payload([plan('basic', 17900, 10740, promoOn, { recommended: true }), plan('whatsapp', 19900, 11940, promoOn, { recommended: true })]),
    ];
    for (const b of bad) expect(parseCatalog(b, NOW)).toBeNull();
  });

  it('promo disabled: full price only, no banner, nothing struck through', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 17900, promoOff), plan('whatsapp', 19900, 19900, promoOff)]), NOW)!;
    expect(c.plans.basic).toEqual({ fullMinor: 17900, finalMinor: 17900, promo: null });
    const html = render(c);
    expect(html).not.toContain('<s ');
    expect(html).not.toContain('promo-banner');
    expect(text(html)).toContain('179 ₪');
  });

  it('promo expired (enabled but endsAt passed): shown at full price, also when cached data turns stale later', () => {
    const past = { ...promoOn, endsAt: '2026-11-20T00:00:00Z' };
    expect(parseCatalog(payload([plan('basic', 17900, 10740, past)]), NOW)!.plans.basic!.promo).toBeNull();
    const future = { ...promoOn, endsAt: '2026-11-22T00:00:00Z' };
    const cached = parseCatalog(payload([plan('basic', 17900, 10740, future)]), NOW)!;
    expect(cached.plans.basic!.finalMinor).toBe(10740);
    expect(withoutExpiredPromos(cached, new Date('2026-11-23T00:00:00Z')).plans.basic).toEqual({ fullMinor: 17900, finalMinor: 17900, promo: null });
  });

  it('fixed promo price: final shown exactly as sent (no own math), banner without a percent', () => {
    const fixed = { enabled: true, type: 'fixed', value: 99, months: 2, endsAt: null };
    const c = parseCatalog(payload([plan('basic', 17900, 9900, fixed), plan('whatsapp', 19900, 9900, fixed)]), NOW)!;
    expect(c.plans.basic).toMatchObject({ finalMinor: 9900, promo: { type: 'fixed', months: 2 } });
    const t = text(render(c));
    expect(t).toContain('99 ₪');
    expect(t).toContain('מחיר השקה למנוי חדש ל־2 החודשים הראשונים');
    expect(t).toContain('ל־2 החודשים הראשונים, ואחר כך 179 ₪');
    expect(t).not.toContain('בתוקף עד'); // no endsAt → no end date
  });

  it('rounding: agorot shown only when sent; whole shekels otherwise; mixed promos get a neutral banner', () => {
    expect(shekels(10740)).toBe('107.40');
    expect(shekels(10700)).toBe('107');
    expect(shekels(149000)).toBe('1,490'); // same as the parent purchase page (he-IL)
    expect(promoBanner([{ fullMinor: 1, finalMinor: 1, promo: { type: 'percent', value: 40, months: 3 } }, { fullMinor: 1, finalMinor: 1, promo: { type: 'percent', value: 20, months: 3 } }])).toBe('מחיר השקה למנוי חדש, לתקופה מוגבלת');
    expect(promoBanner([{ fullMinor: 1, finalMinor: 1, promo: null }])).toBeNull();
  });

  it('catalog live WITHOUT promo fields (000078 not applied): catalog base price only, no discount anywhere', () => {
    const c = parseCatalog(payload([plan('basic', 18900, undefined, undefined), plan('whatsapp', 19900, 11940, undefined), plan('phone', 44900, undefined, { enabled: true })]), NOW)!;
    expect(c.plans.basic).toEqual({ fullMinor: 18900, finalMinor: 18900, promo: null });
    expect(c.plans.whatsapp).toEqual({ fullMinor: 19900, finalMinor: 19900, promo: null }); // finalMinor without promo is ignored
    expect(c.plans.premium).toEqual({ fullMinor: 44900, finalMinor: 44900, promo: null }); // promo.enabled without finalMinor too
    const html = render(c);
    expect(html).not.toContain('promo-banner');
    expect(html).not.toContain('<s ');
    expect(text(html)).toContain('189 ₪');
  });

  it('a discount shows only for promo.enabled=true together with finalMinor', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 10740, promoOn), plan('whatsapp', 19900, undefined, promoOn)]), NOW)!;
    expect(c.plans.basic!.promo).not.toBeNull();
    expect(c.plans.whatsapp!.promo).toBeNull();
  });

  it('recommended: catalog flag decides when present; plans.ts default (whatsapp) when absent', () => {
    expect(parseCatalog(live, NOW)!.recommended).toBe('whatsapp');
    const c = parseCatalog(payload([plan('basic', 17900, 10740, promoOn, { recommended: true }), plan('whatsapp', 19900, 11940, promoOn, { recommended: false })]), NOW)!;
    expect(c.recommended).toBe('basic');
    const html = render(c);
    expect(html.match(/data-testid="plan-recommended"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="מסלול מומלץ"[^>]*>מומלץ</);
    expect(html).not.toContain('הכי משתלם');
    expect(parseCatalog(payload([plan('basic', 17900, 10740, promoOn, { recommended: false })]), NOW)!.recommended).toBeNull();
  });

  it('only plans the catalog sells are shown; ?plan= links unchanged', () => {
    const html = render(parseCatalog(payload([plan('basic', 17900, 10740, promoOn), plan('phone', 44900, 26940, promoOn)]), NOW)!);
    expect(html).toContain('?plan=basic');
    expect(html).toContain('?plan=phone');
    expect(html).not.toContain('?plan=whatsapp');
  });
});

describe('approved promo copy (Natan, Uri)', () => {
  it('per card: «ל־N החודשים הראשונים, ואחר כך X ₪» from promo.months and priceMinor', () => {
    const t = text(render(parseCatalog(live, NOW)!));
    for (const s of ['ל־3 החודשים הראשונים, ואחר כך 179 ₪', 'ל־3 החודשים הראשונים, ואחר כך 199 ₪', 'ל־3 החודשים הראשונים, ואחר כך 449 ₪', 'מחיר השקה למנוי חדש: 40% הנחה ל־3 החודשים הראשונים']) expect(t).toContain(s);
    expect(t).not.toMatch(/ל-\d/); // maqaf, not a hyphen
  });
  it('end date only when promo.endsAt has a value (Israel date)', () => {
    expect(text(render(parseCatalog(live, NOW)!))).not.toMatch(/בתוקף עד|\d{1,2}\.\d{1,2}\.20\d\d/);
    const ends = { ...promoOn, endsAt: '2026-12-31T21:59:59Z' };
    const t = text(render(parseCatalog(payload([plan('basic', 17900, 10740, ends), plan('whatsapp', 19900, 11940, ends)]), NOW)!));
    expect(t).toContain('מחיר השקה למנוי חדש: 40% הנחה ל־3 החודשים הראשונים · המבצע בתוקף עד 31.12.2026');
    expect(t).toContain('ל־3 החודשים הראשונים, ואחר כך 179 ₪ · המבצע בתוקף עד 31.12.2026');
  });
  it('fallback: no promo on any plan, whatsapp recommended', () => {
    const f = fallbackPricing();
    expect(f.recommended).toBe('whatsapp');
    for (const m of Object.values(f.plans)) expect(m).toEqual({ fullMinor: m!.fullMinor, finalMinor: m!.fullMinor, promo: null });
  });
});

describe('requirements 000078 §8/§10: the server finalMinor is shown to the agora, never re-rounded', () => {
  it('default state 10740 / 11940 / 26940 → 107.40 / 119.40 / 269.40 ₪, never 107 / 119 / 269', () => {
    const t = render(parseCatalog(live, NOW)!).replace(/<[^>]+>/g, ''); // inline spans joined as the eye reads them
    for (const s of ['107.40 ₪', '119.40 ₪', '269.40 ₪', '179 ₪', '199 ₪', '449 ₪']) expect(t).toContain(s);
    expect(t).not.toMatch(/\b(107|119|269) ₪/);
  });
});

describe('catalog available: buy links work, no unavailable notice', () => {
  it('three buy links with ?plan=, no notice, no retry', () => {
    const html = render(parseCatalog(live, NOW)!);
    expect(html.match(/data-testid="plan-buy"/g)).toHaveLength(3);
    expect(html).not.toContain('pricing-unavailable');
    expect(html).not.toContain('pricing-retry');
  });
});

describe('catalog cache: total staleness capped (QA: price switched off must show within 60s)', () => {
  const cat = (fin: number) => parseCatalog(payload([plan('basic', 17900, fin, fin < 17900 ? promoOn : promoOff)]), NOW)!;
  it('serves the cached read under the TTL, and never an entry older than it (no stale-while-revalidate)', async () => {
    __resetCatalogCache();
    let t = 0;
    const load = vi.fn(async () => cat(10740));
    expect((await getCatalogPricing(() => t, load)).plans.basic!.finalMinor).toBe(10740);
    t = CATALOG_TTL_MS - 1;
    await getCatalogPricing(() => t, load);
    expect(load).toHaveBeenCalledTimes(1);
    // Daniel switches the promo off; the first request after the TTL waits for the fresh read and shows it.
    load.mockImplementation(async () => cat(17900));
    t = CATALOG_TTL_MS;
    expect((await getCatalogPricing(() => t, load)).plans.basic!.promo).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(CATALOG_TTL_MS).toBeLessThanOrEqual(60_000);
  });
  it('a fallback is not cached (retry hits the catalog at once); concurrent requests share one read', async () => {
    __resetCatalogCache();
    const load = vi.fn(async () => fallbackPricing());
    await getCatalogPricing(() => 0, load);
    await getCatalogPricing(() => 1, load);
    expect(load).toHaveBeenCalledTimes(2);
    __resetCatalogCache();
    const slow = vi.fn(() => new Promise<CatalogPricing>((r) => setTimeout(() => r(cat(10740)), 5)));
    await Promise.all([getCatalogPricing(() => 0, slow), getCatalogPricing(() => 0, slow), getCatalogPricing(() => 0, slow)]);
    expect(slow).toHaveBeenCalledTimes(1);
  });
  it('no other cache layer: /pricing is force-dynamic, the fetch is no-store, no unstable_cache/revalidate', () => {
    const page = readFileSync('app/pricing/page.tsx', 'utf8');
    const lib = readFileSync('lib/billing/catalog.ts', 'utf8');
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(page).not.toMatch(/export const revalidate/);
    expect(lib).toContain("cache: 'no-store'");
    expect(lib).not.toMatch(/unstable_cache|revalidate:|'use cache'/);
  });
});

describe('legal links on /pricing', () => {
  it('links to the existing terms page and its cancellation/refunds section', () => {
    const html = render(fallbackPricing());
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/terms#payments"');
    expect(html).toMatch(/>תנאי השימוש</);
    expect(html).toMatch(/>מדיניות הביטול וההחזרים</);
    expect(existsSync('app/terms/page.tsx')).toBe(true);
    const terms = readFileSync('app/terms/page.tsx', 'utf8');
    expect(terms).toMatch(/id: 'payments',\s*title: 'תשלומים, מנויים, ביטול והחזרים'/);
    expect(readFileSync('components/legal/LegalParts.tsx', 'utf8')).toContain('<section id={id}');
  });
});

describe('server fetcher falls back to plans.ts', () => {
  const ok = (body: unknown, type = 'application/json') => vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': type } }));
  it('uses the catalog when valid; falls back on 404, HTML, invalid JSON, timeout, or "off"', async () => {
    expect((await fetchCatalogPricing({}, ok(live) as never, NOW)).source).toBe('catalog');
    const fb = fallbackPricing();
    expect(await fetchCatalogPricing({}, vi.fn(async () => new Response('nope', { status: 404 })) as never, NOW)).toEqual(fb);
    expect(await fetchCatalogPricing({}, ok('<html>Redirecting...</html>', 'text/html') as never, NOW)).toEqual(fb);
    expect(await fetchCatalogPricing({}, ok({ product: 'nurawell', plans: 'x' }) as never, NOW)).toEqual(fb);
    expect(await fetchCatalogPricing({}, vi.fn(async () => { throw new DOMException('t', 'TimeoutError'); }) as never, NOW)).toEqual(fb);
    const never = vi.fn();
    expect(await fetchCatalogPricing({ PLATFORM_CATALOG_URL: 'off' }, never as never, NOW)).toEqual(fb);
    expect(never).not.toHaveBeenCalled();
  });
  it('catalog URL: parent /id/catalog by default, https only', () => {
    expect(catalogUrl({})).toBe('https://platform-core-preview.vercel.app/id/catalog/?p=nurawell');
    expect(catalogUrl({ PLATFORM_CATALOG_URL: 'http://x/y' })).toBeNull();
  });
  it('fallback (503 / invalid): base prices from plans.ts, NO discount, WhatsApp still recommended', async () => {
    const fb = await fetchCatalogPricing({}, vi.fn(async () => new Response('down', { status: 503 })) as never, NOW);
    expect(fb.source).toBe('fallback');
    const html = render(fb);
    const t = text(html);
    for (const s of ['179 ₪', '199 ₪', '449 ₪', 'מומלץ']) expect(t).toContain(s);
    // no dead end: a clear Hebrew notice with a retry, and no buy link to a parent page that cannot price the order
    expect(html).toContain('data-testid="pricing-unavailable"');
    expect(t).toContain('המחירים המעודכנים לא זמינים כרגע, ולכן אי אפשר לרכוש עכשיו.');
    expect(html).toMatch(/<a href="\/pricing" data-testid="pricing-retry"[^>]*>לנסות שוב<\/a>/);
    expect(html).not.toContain('data-testid="plan-buy"');
    expect(html).not.toContain('?plan=');
    expect(html.match(/data-testid="plan-unavailable-now"/g)).toHaveLength(3);
    for (const s of ['107', '119', '269', 'מחיר השקה', 'החודשים הראשונים', 'הנחה']) expect(t).not.toContain(s);
    expect(html).not.toContain('<s ');
    expect(html.match(/data-testid="plan-recommended"/g)).toHaveLength(1);
  });
});

describe('guard: no plan price literal outside plans.ts', () => {
  it('app/ and components/ and lib/ hold no 179/199/449/107/119/269/1490/1690/3790 shekel price', () => {
    const roots = ['app', 'components', 'lib'];
    const allowed = new Set(['lib/billing/plans.ts']);
    const price = /(₪\s?(107|119|269|179|199|449|1490|1690|3790)\b)|\b(107|119|269|179|199|449|1490|1690|3790)\s?(₪|ש["״]ח|ILS)|\b(17900|19900|44900|10740|11940|26940)\b|(Ils|Minor|price\w*|percentOff)\s*[:=]\s*(107|119|269|179|199|449|1490|1690|3790|40)\b/i;
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { if (n !== 'vendor' && n !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(n) || allowed.has(p) || /generated/.test(n)) continue;
        if (price.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
    expect(price.test(readFileSync('lib/billing/plans.ts', 'utf8'))).toBe(true); // the guard would see a moved price
  });
});
