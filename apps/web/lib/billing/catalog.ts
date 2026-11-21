import 'server-only';
import { unstable_cache } from 'next/cache';
import { PARENT } from '@/lib/central/parent-connect';
import { fallbackPricing, type CatalogPricing } from './plans';
import { parseCatalog } from './catalog-parse';

/** Seconds a catalog read is reused (server-side). The parent also sends Cache-Control max-age=60. */
export const CATALOG_REVALIDATE_S = 300;
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

/** Cached for CATALOG_REVALIDATE_S across requests, so /pricing costs one parent call per 5 minutes at most. */
export const getCatalogPricing = unstable_cache(() => fetchCatalogPricing(), ['nurawell-catalog-pricing-v1'], { revalidate: CATALOG_REVALIDATE_S });
