import 'server-only';
/** Owner edits (new signed 'provenance' records), receipt/invoice attachments, license-page snapshots, verification. */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicKeyPem, sha256Hex } from '../evidence-crypto';
import { verifyTsaResponse } from '../tsa';
import { GENERATORS, SOURCE_TYPES, missingFields, statusFor, verifyMediaChain, type MediaRecord, type Provenance } from './core';
import { appendMediaEvidence } from './record';
import { loadLegalObject } from '../evidence-storage';
import { storeMediaBlob } from './store';
import { waybackTimestamp } from './terms-core';
import type { IndexRow } from './ingest';

const url = z.union([z.string().trim().url().max(2000), z.literal(''), z.null()]).optional();
const str = (n: number) => z.union([z.string().trim().max(n), z.null()]).optional();
export const provenanceInputSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  source_url: url, author: str(200), author_url: url, license_name: str(200), license_url: url,
  generator: z.union([z.enum(Object.keys(GENERATORS) as [keyof typeof GENERATORS, ...Array<keyof typeof GENERATORS>]), z.null()]).optional(),
  model: str(120), prompt: str(8000), created_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  account: str(200), plan: str(120), track_id: str(200), track_url: url, tos_url: url, notes: str(2000),
  license_status: z.union([z.enum(['pending', 'confirmed']), z.null()]).optional(),
}).strict();

export async function loadAsset(admin: SupabaseClient, key: string) {
  const { data } = await admin.from('media_provenance_assets').select('*').eq('asset_key', key).maybeSingle();
  return data as IndexRow | null;
}

export async function updateProvenance(admin: SupabaseClient, key: string, input: z.infer<typeof provenanceInputSchema>, actor: { id: string }) {
  const a = await loadAsset(admin, key);
  if (!a) return { ok: false as const, error: 'not_found' };
  const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? null : v])) as Provenance;
  if (clean.generator && !clean.tos_url) clean.tos_url = GENERATORS[clean.generator].tos || null;
  const prov: Provenance = { ...clean, attachments: a.provenance?.attachments ?? [], confirmed_by_owner: true };
  const hasGit = !!a.first_commit;
  const rec = await appendMediaEvidence(admin, key, 'provenance', { provenance: prov, file_sha256: a.sha256, actor_id: actor.id, previous: a.provenance ?? null });
  if (!rec.ok) return { ok: false as const, error: rec.error };
  const missing = missingFields(prov, hasGit);
  await admin.from('media_provenance_assets').update({ provenance: prov, source_type: prov.source_type, status: statusFor(prov, hasGit), missing, latest_record_hash: rec.recordHash, records: a.records + 1, updated_at: new Date().toISOString() }).eq('asset_key', key);
  void snapshotUrls(admin, key, [prov.source_url, prov.license_url, prov.tos_url, prov.track_url], fetch, prov.created_on ?? null).catch(() => undefined);
  return { ok: true as const, missing };
}

export const MAX_ATTACHMENT = 8_000_000;
export async function addAttachment(admin: SupabaseClient, key: string, file: { bytes: Buffer; name: string; mime: string; label: string; resolvesLicense?: boolean }, actor: { id: string }) {
  const a = await loadAsset(admin, key);
  if (!a) return { ok: false as const, error: 'not_found' };
  if (file.bytes.length > MAX_ATTACHMENT) return { ok: false as const, error: 'too_large' };
  const blob = await storeMediaBlob(admin, file.bytes, file.mime);
  if (!blob) return { ok: false as const, error: 'store_failed' };
  const att = { sha256: blob.sha256, name: file.name.slice(0, 200), mime: file.mime, label: file.label.slice(0, 120) };
  const resolves = !!file.resolvesLicense;
  const rec = await appendMediaEvidence(admin, key, 'attachment', { ...att, bytes: file.bytes.length, file_sha256: a.sha256, actor_id: actor.id, resolves_license: resolves, license_status_after: resolves ? 'confirmed' : (a.provenance?.license_status ?? null) });
  if (!rec.ok) return { ok: false as const, error: rec.error };
  const prov: Provenance = { ...(a.provenance ?? {}), attachments: [...(a.provenance?.attachments ?? []).filter((x) => x.sha256 !== att.sha256), att], ...(resolves ? { license_status: 'confirmed' as const } : {}) };
  const hasGit = !!a.first_commit;
  await admin.from('media_provenance_assets').update({ provenance: prov, status: statusFor(prov, hasGit), missing: missingFields(prov, hasGit), latest_record_hash: rec.recordHash, records: a.records + 1, updated_at: new Date().toISOString() }).eq('asset_key', key);
  return { ok: true as const, attachment: att };
}

/** Archives the public source / license / ToS page as it is now (bytes + hash, TSA-stamped) + Wayback lookup. */
export async function snapshotUrls(admin: SupabaseClient, key: string, urls: Array<string | null | undefined>, fetchImpl: typeof fetch = fetch, createdOn: string | null = null) {
  const list = [...new Set(urls.filter((u): u is string => !!u && /^https:\/\//.test(u)))].slice(0, 4);
  const { data: prev } = await admin.from('media_evidence').select('payload_json').eq('asset_key', key).eq('event', 'license_snapshot');
  const done = new Set(((prev ?? []) as Array<{ payload_json: string }>).map((r) => { try { return JSON.parse(r.payload_json).data.url as string; } catch { return ''; } }));
  const out: Array<{ url: string; ok: boolean }> = [];
  for (const u of list) {
    if (done.has(u)) continue;
    let status = 0; let blobSha: string | null = null; let bytes = 0; let ctype: string | null = null; let err: string | null = null;
    try {
      const r = await fetchImpl(u, { redirect: 'follow', signal: AbortSignal.timeout(12_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; NuraWell-LegalArchive/1.0)', accept: 'text/html,application/xhtml+xml,*/*' } });
      status = r.status; ctype = r.headers.get('content-type');
      const buf = Buffer.from(await r.arrayBuffer());
      bytes = buf.length;
      if (r.ok && buf.length <= 3_000_000) blobSha = (await storeMediaBlob(admin, buf, (ctype ?? 'text/html').split(';')[0]!))?.sha256 ?? null;
    } catch (e) { err = e instanceof Error ? e.name : 'error'; }
    let wayback: { url: string; timestamp: string } | null = null;
    try {
      const w = await fetchImpl(`https://archive.org/wayback/available?url=${encodeURIComponent(u)}${waybackTimestamp(createdOn) ? `&timestamp=${waybackTimestamp(createdOn)}` : ''}`, { signal: AbortSignal.timeout(8000) });
      const j = (await w.json()) as { archived_snapshots?: { closest?: { url?: string; timestamp?: string; available?: boolean } } };
      const c = j.archived_snapshots?.closest;
      if (c?.available && c.url) wayback = { url: c.url, timestamp: c.timestamp ?? '' };
    } catch { /* optional */ }
    await appendMediaEvidence(admin, key, 'license_snapshot', { url: u, fetched_at: new Date().toISOString(), http_status: status, content_type: ctype, bytes, sha256: blobSha, blob_sha: blobSha, error: err, wayback, wayback_target_day: createdOn });
    out.push({ url: u, ok: !!blobSha });
  }
  return out;
}

export async function loadMediaEvidence(admin: SupabaseClient, key: string) {
  const { data: recs } = await admin.from('media_evidence').select('id, asset_key, event, payload_json, prev_hash, record_hash, signature, signing_key_id, created_at').eq('asset_key', key).order('created_at').order('id');
  const records = (recs ?? []) as Array<MediaRecord & { signing_key_id: string }>;
  const ids = records.map((r) => r.id);
  const { data: atts } = ids.length ? await admin.from('media_evidence_attestations').select('record_id, kind, digest, payload, created_at').in('record_id', ids) : { data: [] };
  const attestations = (atts ?? []) as Array<{ record_id: string; kind: string; digest: string; payload: Record<string, unknown>; created_at: string }>;
  // Offloaded TSA tokens: fetch from the legal bucket and accept only if the stored SHA-256 matches.
  await Promise.all(attestations.map(async (a) => {
    const ref = a.payload?.token_ref;
    if (a.kind !== 'tsa' || typeof ref !== 'string' || a.payload.token_b64) return;
    try {
      const bytes = await loadLegalObject(ref);
      if (bytes && sha256Hex(bytes) === a.payload.token_sha256) a.payload = { ...a.payload, token_b64: bytes.toString('base64') };
    } catch { /* leaves token missing → tsa_ok=false, surfaced in verification */ }
  }));
  return { records, attestations };
}

export async function verifyMediaAsset(admin: SupabaseClient, key: string, fileBytes?: Buffer | null) {
  const { records, attestations } = await loadMediaEvidence(admin, key);
  const chain = verifyMediaChain(records, publicKeyPem());
  const checks = records.map((r, i) => {
    const tsaRow = attestations.find((a) => a.record_id === r.id && a.kind === 'tsa' && a.payload.token_b64);
    const tsa = tsaRow ? verifyTsaResponse(Buffer.from(String(tsaRow.payload.token_b64), 'base64'), r.record_hash, String(tsaRow.payload.nonce ?? '') || undefined) : null;
    const ots = attestations.find((a) => a.record_id === r.id && a.kind === 'ots');
    return { id: r.id, event: r.event, created_at: r.created_at, problems: chain.results[i]!.problems, tsa_ok: !!tsa?.ok, tsa_time: tsa?.genTime ?? null, ots: Array.isArray(ots?.payload.proofs) ? (ots!.payload.proofs as unknown[]).length : 0 };
  });
  const lastScan = [...records].reverse().find((r) => r.event === 'scan');
  let fileOk: boolean | null = null;
  if (fileBytes && lastScan) { try { fileOk = JSON.parse(lastScan.payload_json).data.sha256 === sha256Hex(fileBytes); } catch { fileOk = false; } }
  return { ok: chain.ok && checks.every((c) => c.tsa_ok) && fileOk !== false, chain_ok: chain.ok, file_ok: fileOk, checks, records, attestations };
}
