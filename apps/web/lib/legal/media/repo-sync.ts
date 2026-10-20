import 'server-only';
/**
 * Event-driven repo ingest: the committed manifest (regenerated with the media, enforced by a CI test)
 * is ingested once per deploy — triggered by the first Ops "מקור מדיה" view or the manual scan button.
 * public/ bytes are read back from our own site; bundled fonts from disk. No cron, no polling.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '../evidence-crypto';
import manifest from './repo-manifest.json';
import { markAbsent, processEntry, type ManifestEntry } from './ingest';

const entries = manifest as unknown as ManifestEntry[];
export const REPO_MANIFEST_HASH = sha256Hex(entries.map((e) => `${e.asset_key}=${e.sha256}`).join('\n'));

export async function repoSyncNeeded(admin: SupabaseClient) {
  const { data } = await admin.from('media_scan_state').select('value').eq('key', 'repo_manifest').maybeSingle();
  return (data as { value?: string } | null)?.value !== REPO_MANIFEST_HASH;
}

async function bytesFor(e: ManifestEntry, origin: string): Promise<Buffer | null> {
  if (e.content_b64) return Buffer.from(e.content_b64, 'base64');
  if (e.public_url) {
    try { const r = await fetch(`${origin}${e.public_url}`, { signal: AbortSignal.timeout(10_000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* fall through */ }
    return null;
  }
  if (e.path?.startsWith('apps/web/lib/legal/fonts/')) {
    try { return await readFile(path.join(process.cwd(), e.path.replace(/^apps\/web\//, ''))); } catch { return null; }
  }
  return null;
}

export async function syncRepoManifest(admin: SupabaseClient, origin: string) {
  const out = { new: 0, changed: 0, unchanged: 0, error: 0, cost: 0, absent: 0 };
  const { data: known } = await admin.from('media_provenance_assets').select('asset_key, sha256').in('origin', ['repo', 'inline', 'font', 'library']);
  const have = new Map(((known ?? []) as Array<{ asset_key: string; sha256: string | null }>).map((r) => [r.asset_key, r.sha256]));
  const todo = entries.filter((e) => !have.has(e.asset_key) || (e.sha256 && have.get(e.asset_key) !== e.sha256));
  for (let i = 0; i < todo.length; i += 3) {
    const res = await Promise.all(todo.slice(i, i + 3).map(async (e) => {
      const b = await bytesFor(e, origin);
      if (b && e.sha256 && sha256Hex(b) !== e.sha256) return { outcome: 'error' as const, cost: null }; // deployed file ≠ manifest
      return processEntry(admin, { ...e, content_b64: null }, b);
    }));
    for (const r of res) { out[r.outcome] += 1; out.cost += r.cost ?? 0; }
  }
  out.unchanged = entries.length - todo.length;
  out.absent = await markAbsent(admin, ['repo', 'inline', 'font', 'library'], entries.map((e) => e.asset_key));
  if (!out.error) await admin.from('media_scan_state').upsert({ key: 'repo_manifest', value: REPO_MANIFEST_HASH, updated_at: new Date().toISOString() });
  return out;
}
