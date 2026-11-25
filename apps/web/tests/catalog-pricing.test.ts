import { readdirSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseCatalog } from '@/lib/billing/catalog-parse';
import { CATALOG_TTL_MS, __resetCatalogCache, catalogUrl, fetchCatalogPricing, getCatalogPricing } from '@/lib/billing/catalog';
import { fallbackPricing, withoutExpiredPromos, RECOMMENDED_PLAN, type CatalogPricing } from '@/lib/billing/plans';
import { PlansGrid, promoBanner, promoEndDate, shekels } from '@/components/billing/PlansGrid';

const NOW = new Date('2026-11-21T08:00:00Z');
const promoOn = { enabled: true, type: 'percent', value: 40, months: 3, endsAt: null };
const promoOff = { enabled: false, type: 'percent', value: 40, months: 3, endsAt: null };
const plan = (id: string, priceMinor: number, finalMinor: number | undefined, promo: unknown, extra: Record<string, unknown> = {}) => ({
  id, name: id, priceMinor, currency: 'ILS', ...(finalMinor === undefined ? {} : { finalMinor }), ...(promo === undefined ? {} : { promo }), ...extra,
});
const payload = (plans: unknown[]) => ({ product: 'nurawell', updatedAt: '2026-11-21T07:00:00Z', plans });
const live = payload([plan('basic', 17900, 10700, promoOn), plan('whatsapp', 19900, 11900, promoOn), plan('phone', 44900, 26900, promoOn)]);
const render = (pricing: CatalogPricing) => renderToStaticMarkup(createElement(PlansGrid, { purchaseBase: 'https://platform-core-preview.vercel.app/products/nurawell/', pricing }));
const visibleText = (html: string) => new JSDOM(`<div>${html}</div>`).window.document.body.textContent ?? '';
const text = (html: string) => visibleText(html).replace(/\s+/g, ' ');


describe('central catalog adapter', () => {
  it('parses the contract: base and final prices as sent, promo months, phone → premium', () => {
    const c = parseCatalog(live, NOW)!;
    expect(c.source).toBe('catalog');
    expect(c.plans.basic).toMatchObject({ fullMinor: 17900, finalMinor: 10700, promo: { type: 'percent', value: 40, months: 3 } });
    expect(c.plans.premium).toMatchObject({ fullMinor: 44900, finalMinor: 26900 });
    expect(c.recommended).toBe(RECOMMENDED_PLAN);
  });

  it('whole-payload failures return null (caller falls back): not an object, other product, no plans, no usable plan', () => {
    const bad: unknown[] = [
      null, 'x', {}, payload([]),
      { ...live, product: 'other' },
      { product: 'nurawell', updatedAt: null, plans: 'x' },
      payload([plan('gold', 17900, 10700, promoOn)]), // only an unknown plan
      payload([plan('basic', 17900, 10700, promoOn, { currency: 'USD' })]), // only a malformed plan
      payload([plan('basic', 17900.5, 10700, promoOn)]),
    ];
    for (const b of bad) expect(parseCatalog(b, NOW)).toBeNull();
  });

  it('per plan: an inconsistent promo/finalMinor shows that plan at base price, never a guessed amount', () => {
    const c = parseCatalog(payload([
      plan('basic', 17900, 18000, promoOff), // final > base
      plan('whatsapp', 19900, 11900, promoOff), // discounted while the promo says off
      plan('phone', 44900, 44900, promoOn), // promo on but no discount
    ]), NOW)!;
    expect(c.source).toBe('catalog');
    for (const id of ['basic', 'whatsapp', 'premium'] as const) expect(c.plans[id]!.promo).toBeNull();
    expect(c.plans.basic).toEqual({ fullMinor: 17900, finalMinor: 17900, promo: null });
    expect(c.plans.whatsapp).toEqual({ fullMinor: 19900, finalMinor: 19900, promo: null });
  });

  it('duplicate plan id: the first one wins', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 10700, promoOn), plan('basic', 99900, 99900, promoOff)]), NOW)!;
    expect(c.plans.basic!.finalMinor).toBe(10700);
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
    expect(parseCatalog(payload([plan('basic', 17900, 10700, past)]), NOW)!.plans.basic!.promo).toBeNull();
    const future = { ...promoOn, endsAt: '2026-11-22T00:00:00Z' };
    const cached = parseCatalog(payload([plan('basic', 17900, 10700, future)]), NOW)!;
    expect(cached.plans.basic!.finalMinor).toBe(10700);
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

  it('shekels() matches the parent money() amount: whole shekel, no decimal; otherwise two-digit agorot; never rounded up', () => {
    expect(shekels(10700)).toBe('107');
    expect(shekels(11900)).toBe('119');
    expect(shekels(26900)).toBe('269');
    expect(shekels(17900)).toBe('179');
    expect(shekels(149000)).toBe('1,490'); // he-IL grouping, same as the parent purchase page
    expect(shekels(10700)).not.toContain('.');
    expect(shekels(12345)).toBe('123.45');
    expect(shekels(15550)).toBe('155.50');
    expect(shekels(15550)).not.toBe('156');
    expect(shekels(15549)).toBe('155.49');
    expect(shekels(12300)).toBe('123');
    expect(promoBanner([{ fullMinor: 1, finalMinor: 1, promo: { type: 'percent', value: 40, months: 3 } }, { fullMinor: 1, finalMinor: 1, promo: { type: 'percent', value: 20, months: 3 } }])).toBe('מחיר השקה למנוי חדש, לתקופה מוגבלת');
    expect(promoBanner([{ fullMinor: 1, finalMinor: 1, promo: null }])).toBeNull();
  });

  it('catalog live WITHOUT promo fields (000078 not applied): catalog base price only, no discount anywhere', () => {
    const c = parseCatalog(payload([plan('basic', 18900, undefined, undefined), plan('whatsapp', 19900, 11900, undefined), plan('phone', 44900, undefined, { enabled: true })]), NOW)!;
    expect(c.plans.basic).toEqual({ fullMinor: 18900, finalMinor: 18900, promo: null });
    expect(c.plans.whatsapp).toEqual({ fullMinor: 19900, finalMinor: 19900, promo: null }); // finalMinor without promo is ignored
    expect(c.plans.premium).toEqual({ fullMinor: 44900, finalMinor: 44900, promo: null }); // promo.enabled without finalMinor too
    const html = render(c);
    expect(html).not.toContain('promo-banner');
    expect(html).not.toContain('<s ');
    expect(text(html)).toContain('189 ₪');
  });

  it('a discount shows only for promo.enabled=true together with finalMinor', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 10700, promoOn), plan('whatsapp', 19900, undefined, promoOn)]), NOW)!;
    expect(c.plans.basic!.promo).not.toBeNull();
    expect(c.plans.whatsapp!.promo).toBeNull();
  });

  it('recommended: catalog flag decides when present; plans.ts default (whatsapp) when absent', () => {
    expect(parseCatalog(live, NOW)!.recommended).toBe('whatsapp');
    const c = parseCatalog(payload([plan('basic', 17900, 10700, promoOn, { recommended: true }), plan('whatsapp', 19900, 11900, promoOn, { recommended: false })]), NOW)!;
    expect(c.recommended).toBe('basic');
    const html = render(c);
    expect(html.match(/data-testid="plan-recommended"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="מסלול מומלץ"[^>]*>מומלץ</);
    expect(html).not.toContain('הכי משתלם');
    expect(parseCatalog(payload([plan('basic', 17900, 10700, promoOn, { recommended: false })]), NOW)!.recommended).toBeNull();
    // two flagged (off-contract): the plans.ts default when it is one of them, else no badge; never a crash
    expect(parseCatalog(payload([plan('basic', 17900, 10700, promoOn, { recommended: true }), plan('whatsapp', 19900, 11900, promoOn, { recommended: true })]), NOW)!.recommended).toBe('whatsapp');
    expect(parseCatalog(payload([plan('basic', 17900, 10700, promoOn, { recommended: true }), plan('phone', 44900, 26900, promoOn, { recommended: true })]), NOW)!.recommended).toBeNull();
  });

  it('only plans the catalog sells are shown; ?plan= links unchanged', () => {
    const html = render(parseCatalog(payload([plan('basic', 17900, 10700, promoOn), plan('phone', 44900, 26900, promoOn)]), NOW)!);
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
  it('end date only when promo.endsAt has a value (Asia/Jerusalem, DD.MM.YYYY, « · המבצע בתוקף עד»)', () => {
    expect(text(render(parseCatalog(live, NOW)!))).not.toMatch(/בתוקף עד|\d{2}\.\d{2}\.20\d\d/);
    // Same digits as the parent purchase page (DD.MM.YYYY), converted in Asia/Jerusalem.
    expect(promoEndDate('2027-01-05T23:59:00+02:00')).toBe('05.01.2027');
    expect(promoEndDate('2026-12-31T21:59:00+00:00')).toBe('31.12.2026');
    expect(promoEndDate('2026-12-31T23:59:00+02:00')).toBe('31.12.2026');
    expect(promoEndDate('2026-12-31T23:30:00Z')).toBe('01.01.2027'); // 01:30 in Asia/Jerusalem
    const ends = { ...promoOn, endsAt: '2026-12-31T21:59:59Z' };
    const t = text(render(parseCatalog(payload([plan('basic', 17900, 10700, ends), plan('whatsapp', 19900, 11900, ends)]), NOW)!));
    expect(t).toContain('מחיר השקה למנוי חדש: 40% הנחה ל־3 החודשים הראשונים · המבצע בתוקף עד 31.12.2026');
    expect(t).toContain('ל־3 החודשים הראשונים, ואחר כך 179 ₪ · המבצע בתוקף עד 31.12.2026');
    const jan = { ...promoOn, endsAt: '2027-01-05T23:59:00+02:00' };
    expect(text(render(parseCatalog(payload([plan('basic', 17900, 10700, jan)]), NOW)!))).toContain(' · המבצע בתוקף עד 05.01.2027');
  });
  it('fallback: no promo on any plan, whatsapp recommended', () => {
    const f = fallbackPricing();
    expect(f.recommended).toBe('whatsapp');
    for (const m of Object.values(f.plans)) expect(m).toEqual({ fullMinor: m!.fullMinor, finalMinor: m!.fullMinor, promo: null });
  });
});

describe('launch discount display: whole shekels, no agorot', () => {
  it('catalog finalMinor 10700 / 11900 / 26900 is shown as 107 / 119 / 269 ₪, with no ".40" and no decimal in the discount prices', () => {
    const html = render(parseCatalog(live, NOW)!);
    const t = visibleText(html); // inline spans joined as the eye reads them
    for (const s of ['107 ₪', '119 ₪', '269 ₪', '179 ₪', '199 ₪', '449 ₪']) expect(t).toContain(s);
    expect(t).not.toContain('.40');
    expect(t).not.toMatch(/107[.,]/);
    expect(t).not.toMatch(/119[.,]/);
    expect(t).not.toMatch(/269[.,]/);
    const prices = [...html.matchAll(/data-testid="plan-price"[^>]*>([^<]*)₪/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    expect(prices).toEqual(['107', '119', '269']);
  });
  it('parseCatalog keeps a 10700 finalMinor as sent; display is 107 / 119 / 269 ₪ with no decimal', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 10700, promoOn), plan('whatsapp', 19900, 11900, promoOn), plan('phone', 44900, 26900, promoOn)]), NOW)!;
    expect(c.plans.basic!.finalMinor).toBe(10700);
    expect(c.plans.whatsapp!.finalMinor).toBe(11900);
    expect(c.plans.premium!.finalMinor).toBe(26900);
    const t = visibleText(render(c));
    for (const s of ['107 ₪', '119 ₪', '269 ₪']) expect(t).toContain(s);
    expect(t).not.toContain('.40');
    expect(t).not.toMatch(/107\.40|119\.40|269\.40/);
  });
  it('a non-whole finalMinor is kept as sent and shown with two-digit agorot, never rounded up', () => {
    const c = parseCatalog(payload([plan('basic', 17900, 12345, promoOn), plan('whatsapp', 19900, 15550, promoOn), plan('phone', 44900, 10700, promoOn)]), NOW)!;
    expect(c.plans.basic!.finalMinor).toBe(12345);
    expect(c.plans.whatsapp!.finalMinor).toBe(15550);
    expect(c.plans.premium!.finalMinor).toBe(10700);
    const t = visibleText(render(c));
    expect(t).toContain('123.45 ₪');
    expect(t).toContain('155.50 ₪');
    expect(t).toContain('107 ₪');
    expect(t).not.toContain('123 ₪');
    expect(t).not.toContain('156 ₪');
    expect(t).not.toMatch(/107\./);
  });
});

describe('item 4: a 4th unknown plan or updatedAt=null never knocks /pricing into "unavailable"', () => {
  const three = [plan('basic', 17900, 10700, promoOn), plan('whatsapp', 19900, 11900, promoOn, { recommended: true }), plan('phone', 44900, 26900, promoOn)];
  it('a 4th unknown plan is skipped; the three known plans render with buy links and the discount', () => {
    const c = parseCatalog(payload([...three, plan('family', 59900, 35940, promoOn)]), NOW)!;
    expect(c.source).toBe('catalog');
    expect(Object.keys(c.plans).sort()).toEqual(['basic', 'premium', 'whatsapp']);
    const html = render(c);
    expect(html).not.toContain('pricing-unavailable');
    expect(html.match(/data-testid="plan-buy"/g)).toHaveLength(3);
    expect(html).not.toContain('family');
    expect(visibleText(html)).toContain('119 ₪');
  });
  it('a malformed plan entry (junk, missing price, wrong currency) is skipped on its own', () => {
    const c = parseCatalog(payload([...three, 'junk', null, { id: 'basic2' }, plan('basic', 17900, 10700, promoOn, { currency: 'USD' })]), NOW)!;
    expect(c.source).toBe('catalog');
    expect(c.plans.basic!.finalMinor).toBe(10700); // the valid basic came first and is kept
    expect(Object.keys(c.plans)).toHaveLength(3);
  });
  it('updatedAt null, missing, or not a date string is accepted (informational only)', () => {
    for (const updatedAt of [null, undefined, '']) {
      const body: Record<string, unknown> = { product: 'nurawell', plans: three };
      if (updatedAt !== undefined) body.updatedAt = updatedAt;
      const c = parseCatalog(body, NOW)!;
      expect(c.source).toBe('catalog');
      expect(c.plans.premium!.finalMinor).toBe(26900);
    }
  });
  it('end to end through the fetcher: 4th plan + updatedAt null → catalog, not fallback', async () => {
    const body = { product: 'nurawell', updatedAt: null, plans: [...three, plan('family', 59900, 35940, promoOn)] };
    const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    const c = await fetchCatalogPricing({}, f as never, NOW);
    expect(c.source).toBe('catalog');
    expect(c.recommended).toBe('whatsapp');
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
    const load = vi.fn(async () => cat(10700));
    expect((await getCatalogPricing(() => t, load)).plans.basic!.finalMinor).toBe(10700);
    t = CATALOG_TTL_MS - 1;
    await getCatalogPricing(() => t, load);
    expect(load).toHaveBeenCalledTimes(1);
    // The owner switches the promo off; the first request after the TTL waits for the fresh read and shows it.
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
    const slow = vi.fn(() => new Promise<CatalogPricing>((r) => setTimeout(() => r(cat(10700)), 5)));
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
    expect(CATALOG_TTL_MS).toBe(30_000);
    expect(lib).toMatch(/30 seconds/);
    expect(page).toMatch(/cached 30 seconds/);
  });
});

describe('billing interval toggle tap target', () => {
  it('חודשי / שנתי buttons use min-h-11 (44px) and keep both radios', () => {
    const html = render(fallbackPricing());
    expect(html).toContain('aria-label="תדירות חיוב"');
    expect(html.match(/<button[^>]*role="radio"[^>]*class="[^"]*min-h-11[^"]*"/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*role="radio"[^>]*class="[^"]*whitespace-nowrap[^"]*"/g)).toHaveLength(1);
    expect(html).toContain('>חודשי<');
    expect(html).toMatch(/שנתי · עד \d+% חיסכון/);
    expect(html).toMatch(/role="radio"[^>]*class="[^"]*\[overflow-wrap:break-word\]/);
    expect(html).not.toMatch(/role="radio"[^>]*min-h-10/);
  });
});


describe('pricing card wrap: words stay whole', () => {
  it('CTA and copy keep WhatsApp in a nowrap bdi, wrap at word boundaries, and stack below lg', () => {
    const html = render(parseCatalog(live, NOW)!);
    expect(html).toMatch(/<bdi class="inline-block max-w-full whitespace-nowrap">WhatsApp<\/bdi>/);
    expect(html.match(/<bdi class="inline-block max-w-full whitespace-nowrap">WhatsApp<\/bdi>/g)!.length).toBeGreaterThan(1);
    expect(visibleText(html)).toContain('בחירה בבסיסי + WhatsApp');
    expect(html).toContain('[overflow-wrap:break-word]');
    expect(html).not.toContain('overflow-wrap:anywhere');
    expect(html).not.toContain('break-all');
    expect(html).toContain('lg:grid-cols-3');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('inline-block max-w-full whitespace-nowrap');
    expect(html).not.toContain('md:grid-cols-3');
    const card = html.match(/data-plan="whatsapp"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(card).toContain('[overflow-wrap:break-word]');
    expect(card).toContain('data-testid="plan-buy"');
    expect(card).toContain('<bdi class="inline-block max-w-full whitespace-nowrap">WhatsApp</bdi>');
    expect(card).toContain('min-h-12');
    expect(card).toContain('min-w-0 max-w-full [overflow-wrap:break-word]');
    expect(card).toContain('flex min-w-0 gap-2');
  });
});

describe('legal links on /pricing', () => {
  it('links to the existing terms page and its cancellation/refunds section', () => {
    const html = render(fallbackPricing());
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/terms#payments"');
    expect(html).toMatch(/>תנאי השימוש</);
    expect(html).toMatch(/>מדיניות הביטול וההחזרים</);
    const terms = readFileSync('app/terms/page.tsx', 'utf8');
    expect(terms).toMatch(/id: 'payments',\s*title: 'תשלומים, מנויים, ביטול והחזרים'/);
    expect(readFileSync('components/legal/LegalParts.tsx', 'utf8')).toContain('<section id={id}');
    // tap targets ≥ 44px (min-h-11) on both links
    expect(html.match(/<a[^>]*class="[^"]*min-h-11[^"]*"[^>]*href="\/terms(#payments)?"|<a[^>]*href="\/terms(#payments)?"[^>]*class="[^"]*min-h-11/g)).toHaveLength(2);
    // /terms lands a #hash deep link on its section after hydration (smooth scroll on <html> used to cut it off)
    expect(readFileSync('components/legal/v2/LegalDoc.tsx', 'utf8')).toContain('<HashScroll />');
    expect(readFileSync('components/legal/v2/HashScroll.tsx', 'utf8')).toMatch(/scrollIntoView\(\{ block: 'start'/);
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
    expect(html).toMatch(/<a href="\/pricing" data-testid="pricing-retry"[^>]*min-h-11[^>]*>לנסות שוב<\/a>|<a href="\/pricing" data-testid="pricing-retry" class="[^"]*min-h-11[^"]*">לנסות שוב<\/a>/);
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
    const price = /(₪\s?(107|119|269|179|199|449|1490|1690|3790)\b)|\b(107|119|269|179|199|449|1490|1690|3790)\s?(₪|ש["״]ח|ILS)|\b(17900|19900|44900|10740|11940|26940|10700|11900|26900)\b|(Ils|Minor|price\w*|percentOff)\s*[:=]\s*(107|119|269|179|199|449|1490|1690|3790|40)\b/i;
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'vendor' && ent.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(ent.name) || allowed.has(p) || /generated/.test(ent.name)) continue;
        let body: string;
        try { body = readFileSync(p, 'utf8'); } catch { continue; }
        if (price.test(body)) hits.push(p);
      }
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
    expect(price.test(readFileSync('lib/billing/plans.ts', 'utf8'))).toBe(true); // the guard would see a moved price
  });
});
