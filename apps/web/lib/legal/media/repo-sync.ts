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
import { PUBLIC_APP_URL_DEFAULT, publicAppOriginFromEnv } from '@/lib/public-app-url';
import { markAbsent, processEntry, type ManifestEntry } from './ingest';

const entries = manifest as unknown as ManifestEntry[];
export const REPO_MANIFEST_HASH = sha256Hex(entries.map((entry) => `${entry.asset_key}=${entry.sha256}`).join('\n'));
const REPO_ORIGINS: Parameters<typeof markAbsent>[1] = ['repo', 'inline', 'font', 'library'];
const FONT_PREFIX = 'apps/web/lib/legal/fonts/';
const PUBLIC_PATH = /^\/[\w./-]+$/;

export const repoSyncNeeded = async (admin: SupabaseClient) => {
  const { data } = await admin.from('media_scan_state').select('value').eq('key', 'repo_manifest').maybeSingle();
  return (data as { value?: string } | null)?.value !== REPO_MANIFEST_HASH;
};

const publicBytes = async (publicUrl: string): Promise<Buffer | null> => {
  const origin = publicAppOriginFromEnv() ?? PUBLIC_APP_URL_DEFAULT; // fixed origin, never request-derived
  try {
    const response = await fetch(`${origin}${publicUrl}`, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
};

/** Statically scoped to lib/legal/fonts (flat dir, .ttf only) so the build tracer does not bundle the whole project. */
const fontBytes = async (repoPath: string): Promise<Buffer | null> => {
  if (!repoPath.endsWith('.ttf')) return null;
  try {
    return await readFile(path.join(process.cwd(), 'lib', 'legal', 'fonts', path.basename(repoPath)));
  } catch {
    return null;
  }
};

const bytesFor = (entry: ManifestEntry): Promise<Buffer | null> => {
  if (entry.content_b64) return Promise.resolve(Buffer.from(entry.content_b64, 'base64'));
  if (entry.public_url && PUBLIC_PATH.test(entry.public_url)) return publicBytes(entry.public_url);
  if (entry.path?.startsWith(FONT_PREFIX)) return fontBytes(entry.path);
  return Promise.resolve(null);
};

const needsSync = (have: Map<string, string | null>, entry: ManifestEntry) =>
  !have.has(entry.asset_key) || Boolean(entry.sha256 && have.get(entry.asset_key) !== entry.sha256);

const ingestOne = async (admin: SupabaseClient, entry: ManifestEntry) => {
  const bytes = await bytesFor(entry);
  if (bytes && entry.sha256 && sha256Hex(bytes) !== entry.sha256) return { outcome: 'error' as const, cost: null }; // deployed file ≠ manifest
  return processEntry(admin, { ...entry, content_b64: null }, bytes);
};

export const syncRepoManifest = async (admin: SupabaseClient) => {
  const out = { new: 0, changed: 0, unchanged: 0, error: 0, cost: 0, absent: 0 };
  const { data: known } = await admin.from('media_provenance_assets').select('asset_key, sha256').in('origin', REPO_ORIGINS);
  const have = new Map(((known ?? []) as Array<{ asset_key: string; sha256: string | null }>).map((row) => [row.asset_key, row.sha256]));
  const todo = entries.filter((entry) => needsSync(have, entry));
  for (let start = 0; start < todo.length; start += 3) {
    const results = await Promise.all(todo.slice(start, start + 3).map((entry) => ingestOne(admin, entry)));
    for (const result of results) { out[result.outcome] += 1; out.cost += result.cost ?? 0; }
  }
  out.unchanged = entries.length - todo.length;
  out.absent = await markAbsent(admin, REPO_ORIGINS, entries.map((entry) => entry.asset_key));
  if (!out.error) await admin.from('media_scan_state').upsert({ key: 'repo_manifest', value: REPO_MANIFEST_HASH, updated_at: new Date().toISOString() });
  return out;
};
