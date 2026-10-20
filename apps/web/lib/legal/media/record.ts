import 'server-only';
/** Append-only, hash-chained (per asset), Ed25519-signed, RFC 3161 + OpenTimestamps attested media evidence. */
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GENESIS, sha256Hex, signHash } from '../evidence-crypto';
import { requestTimestamp } from '../tsa';
import { otsStamp } from '../ots';
import { putLegalObject } from '../evidence-storage';
import { buildMediaPayload, type MediaEvidencePayload } from './core';

export type AppendResult = { ok: true; id: string; recordHash: string; createdAt: string } | { ok: false; error: string };

export async function appendMediaEvidence(
  admin: SupabaseClient,
  assetKey: string,
  event: MediaEvidencePayload['event'],
  data: Record<string, unknown>,
  opts: { attest?: boolean } = {}
): Promise<AppendResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await admin.from('media_evidence').select('record_hash').eq('asset_key', assetKey)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
    const prev = (last as { record_hash?: string } | null)?.record_hash ?? GENESIS;
    const createdAt = new Date().toISOString();
    const { json, hash } = buildMediaPayload({ asset_key: assetKey, event, data, created_at: createdAt, prev_hash: prev });
    const sig = signHash(hash);
    const { data: ins, error } = await admin.from('media_evidence')
      .insert({ asset_key: assetKey, event, payload_json: json, prev_hash: prev, record_hash: hash, signature: sig.signature, signing_key_id: sig.keyId, created_at: createdAt })
      .select('id').single();
    if (error) {
      if (error.code === '23505') continue;
      return { ok: false, error: error.message };
    }
    const id = (ins as { id: string }).id;
    if (opts.attest !== false) await attestMedia(admin, id, hash);
    return { ok: true, id, recordHash: hash, createdAt };
  }
  return { ok: false, error: 'chain_contention' };
}

export async function attestMedia(admin: SupabaseClient, recordId: string, hash: string) {
  const [tsa, ots] = await Promise.all([requestTimestamp(hash), otsStamp(hash)]);
  const rows: Array<Record<string, unknown>> = [
    tsa.ok
      ? { record_id: recordId, kind: 'tsa', digest: hash, payload: { url: tsa.url, ...(await offloadTsaToken(hash, tsa.tokenB64)), nonce: tsa.nonceHex, gen_time: tsa.genTime } }
      : { record_id: recordId, kind: 'tsa', digest: hash, payload: { failed: true, error: tsa.error.slice(0, 300) } },
  ];
  if (ots.length) rows.push({ record_id: recordId, kind: 'ots', digest: hash, payload: { proofs: ots } });
  await admin.from('media_evidence_attestations').insert(rows);
}

/** Head over all media records, anchored at most once per ~24h (called from the daily anchor cron). */
export async function maybeAnchorMediaChainHead(admin: SupabaseClient, force = false): Promise<{ anchored: boolean; head?: string; count?: number }> {
  if (!force) {
    const { data } = await admin.from('media_evidence_attestations').select('created_at').eq('kind', 'chain_anchor').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const last = (data as { created_at?: string } | null)?.created_at;
    if (last && Date.now() - new Date(last).getTime() < 23 * 3600_000) return { anchored: false };
  }
  const hashes: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('media_evidence').select('record_hash').order('created_at').order('id').range(from, from + 999);
    const rows = (data ?? []) as Array<{ record_hash: string }>;
    hashes.push(...rows.map((r) => r.record_hash));
    if (rows.length < 1000) break;
  }
  if (!hashes.length) return { anchored: false };
  const head = sha256Hex(hashes.join('\n'));
  const [tsa, ots] = await Promise.all([requestTimestamp(head), otsStamp(head)]);
  await admin.from('media_evidence_attestations').insert({
    record_id: null, kind: 'chain_anchor', digest: head,
    payload: { count: hashes.length, nonce: randomBytes(4).toString('hex'), tsa: tsa.ok ? { url: tsa.url, token_b64: tsa.tokenB64, nonce: tsa.nonceHex, gen_time: tsa.genTime } : { failed: true }, ots },
  });
  return { anchored: true, head, count: hashes.length };
}

/**
 * RFC 3161 tokens are ~6KB of incompressible base64. Keep them in the private EU legal bucket and
 * store only the object key + SHA-256 in the (append-only) attestation row. The record hash chain is
 * unaffected (it lives in media_evidence). Falls back to inline storage if the bucket is unavailable.
 */
export async function offloadTsaToken(hash: string, tokenB64: string): Promise<Record<string, string>> {
  try {
    const bytes = Buffer.from(tokenB64, 'base64');
    const sha = sha256Hex(bytes);
    const key = await putLegalObject(`media-tsa/${hash.slice(0, 2)}/${hash}-${sha.slice(0, 12)}.tsr`, bytes, 'application/timestamp-reply', sha);
    if (key) return { token_ref: key, token_sha256: sha };
  } catch (e) {
    console.warn('[media-evidence] tsa offload failed, storing inline', { error: e instanceof Error ? e.name : 'error' });
  }
  return { token_b64: tokenB64 };
}
