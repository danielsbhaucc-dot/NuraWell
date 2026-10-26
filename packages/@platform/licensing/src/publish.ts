import type { SignedRevocationList } from './revocation';
/** Where the signed public revocation list goes. Free static hosting only; adapters are injected by the app. */
export interface RevocationPublisher { name: string; publish(doc: SignedRevocationList): Promise<{ ok: true; url: string } | { ok: false; error: string }> }
/** Local file adapter (tests, dry runs). Production adapters (public storage bucket / static pages) are app glue. */
export function fileRevocationPublisher(path: string, write: (p: string, s: string) => Promise<void>): RevocationPublisher {
  return { name: 'file', async publish(doc) { try { await write(path, JSON.stringify(doc)); return { ok: true, url: `file://${path}` }; } catch (e) { return { ok: false, error: (e as Error).message }; } } };
}
