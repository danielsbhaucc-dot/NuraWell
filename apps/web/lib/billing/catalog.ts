import 'server-only';
import { PARENT } from '@/lib/central/parent-connect';
import { fallbackPricing, type CatalogPricing } from './plans';
import { parseCatalog } from './catalog-parse';

/** Seconds a catalog read is reused (server-side). The parent also sends Cache-Control max-age=60. */
/**
 * Hard cap on how stale /pricing can be after Daniel changes a price or switches the promo off. The page is
 * force-dynamic (no ISR), the fetch is no-store (no Next data cache), and this per-instance memory cache is the
 * only layer: an entry older than CATALOG_TTL_MS is never served; the request waits for a fresh read instead
 * (stale-while-revalidate would let an idle instance serve an old price once). Worst case = TTL + fetch timeout.
 */
export const CATALOG_TTL_MS = 30_000;
const TIMEOUT_MS = 2_500;

type Env = Record<string, string | undefined>;

/** https URL of the public catalog (plain http only for a loopback mock). PLATFORM_CATALOG_URL overrides; "off" forces the fallback. */
export function catalogUrl(env: Env = process.env): string | null {
  const o = env.PLATFORM_CATALOG_URL?.trim();
  if (o === 'off') return null;
  const raw = o || `${PARENT}/id/catalog/?p=nurawell`;
  try {
    const u = new URL(raw);
    const loopback = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    return u.protocol === 'https:' || loopback ? u.toString() : null;
  } catch {
    return null;
  }
}

/** One uncached read: catalog pricing, or the plans.ts fallback on any error, non-200, non-JSON or invalid data. */
export async function fetchCatalogPricing(env: Env = process.env, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<CatalogPricing> {
  const url = catalogUrl(env);
  if (!url) return fallbackPricing();
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store', redirect: 'error' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return fallbackPricing();
    return parseCatalog(await res.json(), now) ?? fallbackPricing();
  } catch {
    return fallbackPricing();
  }
}

let memo: { at: number; value: CatalogPricing } | null = null;
let inflight: Promise<CatalogPricing> | null = null;

/** Catalog pricing for /pricing: at most CATALOG_TTL_MS old; one shared read per instance at a time. */
export async function getCatalogPricing(nowMs: () => number = Date.now, load: () => Promise<CatalogPricing> = () => fetchCatalogPricing()): Promise<CatalogPricing> {
  if (memo && nowMs() - memo.at < CATALOG_TTL_MS) return memo.value;
  inflight ??= load()
    .then((value) => {
      // A fallback is not cached, so the next request (and the "retry" button) tries the catalog again at once.
      memo = value.source === 'catalog' ? { at: nowMs(), value } : null;
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Tests only. */
export function __resetCatalogCache() {
  memo = null;
  inflight = null;
}
