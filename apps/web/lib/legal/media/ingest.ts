import 'server-only';
/**
 * Scanner pipeline: new/changed media → original stored as content-addressed blob, metadata
 * extracted, cheap description once per hash, provenance draft pre-filled, and a signed +
 * timestamped 'scan' evidence record appended. Unchanged files only refresh usage/last-seen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '../evidence-crypto';
import {
  extractEmbeddedMeta, missingFields, prefillProvenance, searchText, statusFor, usageForObjectKey,
  type AssetKind, type AssetOrigin, type LegacyCredit, type Provenance,
} from './core';
import { appendMediaEvidence } from './record';
import { storeMediaBlob } from './store';
import { imageFacts } from './image';
import { describeMedia } from './ai';

export type GitCommit = { sha: string; author: string; date: string; subject: string; url?: string };
export type ManifestEntry = {
  asset_key: string;
  origin: AssetOrigin;
  kind: AssetKind;
  path?: string | null;
  public_url?: string | null;
  media_asset_id?: string | null;
  title?: string | null;
  mime?: string | null;
  sha256?: string | null;
  content_b64?: string | null;
  usages?: string[];
  first_commit?: GitCommit | null;
  last_commit?: GitCommit | null;
  commits?: number;
  font_family?: string | null;
  library?: { name: string; version: string; license: string } | null;
  legacy_source?: string | null;
  credit?: LegacyCredit | null;
};

export type IndexRow = {
  asset_key: string; origin: AssetOrigin; kind: AssetKind; path: string | null; public_url: string | null; media_asset_id: string | null;
  title: string | null; mime: string | null; bytes: number | null; width: number | null; height: number | null; sha256: string | null; phash: string | null;
  source_type: string; status: string; provenance: Provenance; metadata: Record<string, unknown>; usages: string[]; missing: string[];
  first_commit: GitCommit | null; last_commit: GitCommit | null; ai_description: string | null; ai_tags: string[]; ai_cost_usd: number | null;
  latest_record_hash: string | null; records: number; file_blob_sha: string | null; present: boolean; first_seen_at: string; last_seen_at: string; updated_at: string;
};

export type ProcessOutcome = 'new' | 'changed' | 'unchanged' | 'error';

export async function processEntry(admin: SupabaseClient, e: ManifestEntry, bytesIn?: Buffer | null, opts: { force?: boolean; ai?: boolean } = {}): Promise<{ outcome: ProcessOutcome; cost: number | null; error?: string }> {
  const bytes = bytesIn ?? (e.content_b64 ? Buffer.from(e.content_b64, 'base64') : null);
  const sha = bytes ? sha256Hex(bytes) : e.sha256 ?? (e.library ? sha256Hex(`${e.library.name}@${e.library.version}`) : e.font_family ? sha256Hex(`font:${e.font_family}`) : null);
  if (e.sha256 && bytes && e.sha256 !== sha) return { outcome: 'error', cost: null, error: 'sha_mismatch' };
  const usages = [...new Set([...(e.usages ?? []), ...usageForObjectKey(e.path)])].slice(0, 40);
  const { data: ex } = await admin.from('media_provenance_assets').select('*').eq('asset_key', e.asset_key).maybeSingle();
  const existing = ex as IndexRow | null;
  const now = new Date().toISOString();
  if (existing && existing.sha256 === sha && !opts.force) {
    await admin.from('media_provenance_assets').update({ usages, last_seen_at: now, present: true, last_commit: e.last_commit ?? existing.last_commit, title: e.title ?? existing.title }).eq('asset_key', e.asset_key);
    return { outcome: 'unchanged', cost: null };
  }

  const mime = e.mime ?? null;
  const meta = bytes ? extractEmbeddedMeta(bytes, mime) : { c2pa: false };
  const facts = bytes && mime ? await imageFacts(bytes, mime) : { width: null, height: null, phash: null, thumbJpeg: null };
  const blob = bytes ? await storeMediaBlob(admin, bytes, mime ?? 'application/octet-stream') : null;
  const hasGit = !!e.first_commit;
  const prior = existing?.provenance && existing.provenance.source_type && existing.provenance.source_type !== 'unknown' ? existing.provenance : null;
  const draft: Provenance = prior ?? prefillProvenance({ origin: e.origin, kind: e.kind, path: e.path, legacySource: e.legacy_source, credit: e.credit, meta, hasGitProof: hasGit, fontFamily: e.font_family, library: e.library ?? null });

  let ai: Awaited<ReturnType<typeof describeMedia>> | null = null;
  if (opts.ai !== false && e.origin !== 'font' && e.origin !== 'library' && (existing?.sha256 !== sha || !existing?.ai_description)) {
    const hints = [meta.c2pa ? `C2PA${meta.c2pa_claim_generator ? `: ${meta.c2pa_claim_generator}` : ''}` : null, meta.software, meta.digital_source_type, meta.description, meta.svg_title, meta.id3 ? Object.values(meta.id3).join(' ') : null].filter((x): x is string => !!x);
    const svgText = mime?.includes('svg') && bytes ? bytes.toString('utf8') : null;
    ai = await describeMedia(admin, { name: e.title ?? e.path ?? e.asset_key, path: e.path ?? null, kind: e.kind, mime, width: facts.width, height: facts.height, hints, usages, thumbJpeg: svgText ? null : facts.thumbJpeg, svgText });
  }

  const missing = missingFields(draft, hasGit);
  const status = statusFor(draft, hasGit);
  const rec = await appendMediaEvidence(admin, e.asset_key, 'scan', {
    change: existing ? 'changed' : 'new',
    previous_sha256: existing?.sha256 ?? null,
    sha256: sha, phash: facts.phash, bytes: bytes?.length ?? null, mime, width: facts.width, height: facts.height,
    origin: e.origin, kind: e.kind, path: e.path ?? null, public_url: e.public_url ?? null, media_asset_id: e.media_asset_id ?? null,
    file_blob_sha: blob?.sha256 ?? null, first_commit: e.first_commit ?? null, last_commit: e.last_commit ?? null, commits: e.commits ?? null,
    usages, embedded_metadata: meta, provenance_draft: draft, library: e.library ?? null, font_family: e.font_family ?? null,
    legacy_credit: e.credit ?? null, legacy_source: e.legacy_source ?? null,
    ai: ai?.result ? { model: ai.model, description_he: ai.result.description_he, tags: ai.result.tags, likely_source: ai.result.likely_source, confidence: ai.result.confidence } : null,
  });
  if (!rec.ok) return { outcome: 'error', cost: ai?.costUsd ?? null, error: rec.error };

  const row = {
    asset_key: e.asset_key, origin: e.origin, kind: e.kind, path: e.path ?? null, public_url: e.public_url ?? null, media_asset_id: e.media_asset_id ?? null,
    title: e.title ?? existing?.title ?? null, mime, bytes: bytes?.length ?? null, width: facts.width, height: facts.height, sha256: sha, phash: facts.phash,
    source_type: draft.source_type ?? 'unknown', status, provenance: draft,
    metadata: { ...meta, ai_likely_source: ai?.result?.likely_source ?? existing?.metadata?.ai_likely_source ?? null, ai_confidence: ai?.result?.confidence ?? null, library: e.library ?? null, font_family: e.font_family ?? null, commits: e.commits ?? null },
    usages, missing, first_commit: e.first_commit ?? existing?.first_commit ?? null, last_commit: e.last_commit ?? null,
    ai_description: ai?.result?.description_he ?? existing?.ai_description ?? null, ai_tags: ai?.result?.tags ?? existing?.ai_tags ?? [],
    ai_cost_usd: ai?.costUsd ?? existing?.ai_cost_usd ?? null,
    latest_record_hash: rec.recordHash, records: (existing?.records ?? 0) + 1, file_blob_sha: blob?.sha256 ?? existing?.file_blob_sha ?? null,
    present: true, last_seen_at: now, updated_at: now,
  };
  const { error } = await admin.from('media_provenance_assets').upsert(row, { onConflict: 'asset_key' });
  if (error) return { outcome: 'error', cost: ai?.costUsd ?? null, error: error.message };
  return { outcome: existing ? 'changed' : 'new', cost: ai?.costUsd ?? null };
}

export async function markAbsent(admin: SupabaseClient, origins: AssetOrigin[], seen: string[]) {
  const { data } = await admin.from('media_provenance_assets').select('asset_key').in('origin', origins).eq('present', true);
  const gone = ((data ?? []) as Array<{ asset_key: string }>).map((r) => r.asset_key).filter((k) => !seen.includes(k));
  if (gone.length) await admin.from('media_provenance_assets').update({ present: false }).in('asset_key', gone);
  return gone.length;
}

/** Media stored in our buckets (media_assets). User avatars are personal data and are never scanned. */
export async function scanStorage(admin: SupabaseClient, opts: { only?: string; force?: boolean } = {}) {
  const { getR2Client, r2BucketNameForMediaBucket } = await import('@/lib/storage/r2-almog');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  let q = admin.from('media_assets').select('id, kind, bucket, object_key, public_url, external_url, title, original_filename, mime_type, source, credit, alt_text, created_at, created_by');
  if (opts.only) q = q.eq('id', opts.only);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; kind: string; bucket: 'images' | 'audio' | 'files' | null; object_key: string | null; public_url: string | null; external_url: string | null; title: string | null; original_filename: string | null; mime_type: string | null; source: string; credit: LegacyCredit; alt_text: string | null }>;
  const out = { total: rows.length, new: 0, changed: 0, unchanged: 0, error: 0, cost: 0 };
  const s3 = getR2Client();
  const work = rows.map((r) => async () => {
    let bytes: Buffer | null = null;
    if (r.bucket && r.object_key) {
      const b = r2BucketNameForMediaBucket(r.bucket);
      try {
        if (b) {
          const o = await s3.send(new GetObjectCommand({ Bucket: b, Key: r.object_key }));
          if ((o.ContentLength ?? 0) <= 40_000_000) { const arr = await o.Body?.transformToByteArray(); bytes = arr ? Buffer.from(arr) : null; }
        }
      } catch { bytes = null; }
    }
    const kind: AssetKind = r.kind === 'image' ? 'image' : r.kind === 'audio' ? 'audio' : r.kind === 'video' ? 'video' : 'file';
    const res = await processEntry(admin, {
      asset_key: `db:${r.id}`, origin: 'storage', kind, path: r.object_key ?? r.external_url, public_url: r.public_url ?? r.external_url, media_asset_id: r.id,
      title: r.title ?? r.original_filename, mime: r.mime_type ?? (kind === 'video' ? 'video/hls' : null), legacy_source: r.source, credit: r.credit,
      sha256: bytes ? null : r.external_url ? sha256Hex(r.external_url) : null,
    }, bytes, { force: opts.force });
    out[res.outcome] += 1;
    out.cost += res.cost ?? 0;
  });
  for (let i = 0; i < work.length; i += 4) await Promise.all(work.slice(i, i + 4).map((w) => w()));
  return out;
}

export function toListItem(r: IndexRow) {
  return {
    key: r.asset_key, origin: r.origin, kind: r.kind, path: r.path, title: r.title, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height,
    sha256: r.sha256, phash: r.phash, source_type: r.source_type, status: r.status, provenance: r.provenance, usages: r.usages, missing: r.missing,
    first_commit: r.first_commit, last_commit: r.last_commit, ai_description: r.ai_description, ai_tags: r.ai_tags, records: r.records,
    present: r.present, media_asset_id: r.media_asset_id, public_url: r.public_url, has_file: !!r.file_blob_sha, updated_at: r.updated_at,
    metadata: { c2pa: r.metadata?.c2pa ?? false, c2pa_claim_generator: r.metadata?.c2pa_claim_generator ?? null, software: r.metadata?.software ?? null, ai_likely_source: r.metadata?.ai_likely_source ?? null, library: r.metadata?.library ?? null, digital_source_type: r.metadata?.digital_source_type ?? null, id3: r.metadata?.id3 ?? null },
    search: searchText({ title: r.title, path: r.path, ai_description: r.ai_description, ai_tags: r.ai_tags, provenance: r.provenance, usages: r.usages }),
  };
}
