import type { SignedRevocationList } from './revocation';
/** Where the signed public revocation list goes. Free static hosting only; adapters are injected by the app. */
export interface RevocationPublisher { name: string; publish(doc: SignedRevocationList): Promise<{ ok: true; url: string } | { ok: false; error: string }> }
/** Local file adapter (tests, dry runs). Production adapters (public storage bucket / static pages) are app glue. */
export function fileRevocationPublisher(path: string, write: (p: string, s: string) => Promise<void>): RevocationPublisher {
  return { name: 'file', async publish(doc) { try { await write(path, JSON.stringify(doc)); return { ok: true, url: `file://${path}` }; } catch (e) { return { ok: false, error: (e as Error).message }; } } };
}
/** In-memory adapter (dev server, tests): serves the last published doc like a static file would. */
export function memoryRevocationPublisher(): RevocationPublisher & { current(): SignedRevocationList | null } {
  let doc: SignedRevocationList | null = null;
  return { name: 'memory', current: () => doc, async publish(d) { doc = JSON.parse(JSON.stringify(d)); return { ok: true, url: 'memory://status.json' }; } };
}
/**
 * Cloudflare static asset adapter (R2 bucket served as static files, or Pages/Workers static assets).
 * Static asset reads are free; no Worker runs per buyer check. `put` is the only thing the app wires later
 * (R2 S3-compatible PUT with credentials from env). Nothing here talks to an account by itself.
 */
export type StaticPut = (key: string, body: string, opts: { contentType: string; cacheControl: string }) => Promise<void>;
export function cloudflareStaticPublisher(o: { put: StaticPut; publicBaseUrl: string; key?: string; cacheSeconds?: number }): RevocationPublisher {
  const key = o.key ?? 'license-status.json';
  return { name: 'cloudflare-static', async publish(doc) {
    try { await o.put(key, JSON.stringify(doc), { contentType: 'application/json', cacheControl: `public, max-age=${o.cacheSeconds ?? 60}` }); return { ok: true, url: `${o.publicBaseUrl.replace(/\/$/, '')}/${key}` }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  } };
}
/** If the list grows: one small file per product/module (shard key chosen by the app). Each shard is signed on its own. */
export function shardKey(base: string, shard: string): string { return base.replace(/\.json$/, '') + `.${shard.replace(/[^a-z0-9-]/gi, '')}.json`; }
