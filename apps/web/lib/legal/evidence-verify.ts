import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptString } from '@/lib/crypto/pii';
import { publicKeyPem, sha256Hex, verifyChain, type StoredRecord } from './evidence-crypto';
import { verifyTsaResponse } from './tsa';
import { loadEvidenceImage } from './evidence-storage';

export type EvidenceRow = StoredRecord & {
  user_id: string;
  action: 'grant' | 'withdraw';
  source: string;
  text_version: string;
  typed_word: string;
  checkbox_checked: boolean;
  ip_hash: string | null;
  ip_enc: string | null;
  user_agent: string | null;
  session_id: string | null;
  device_id: string | null;
  screenshot_sha256: string | null;
  screenshot_storage: string | null;
  screenshot_key: string | null;
  screenshot_bytes: number | null;
  screenshot_segments?: Array<{ i: number; sha256: string; bytes: number; storage: string; key: string }> | null;
  signing_key_id: string;
};
export type AttestationRow = { id: number; record_id: string | null; kind: string; digest: string; payload: Record<string, unknown>; created_at: string };

export async function loadUserEvidence(admin: SupabaseClient, userId: string) {
  const { data: recs, error } = await admin.from('consent_evidence').select('*').eq('user_id', userId).order('created_at').order('id');
  if (error) throw new Error(error.message);
  const records = (recs ?? []) as EvidenceRow[];
  const ids = records.map((r) => r.id);
  const { data: att } = ids.length
    ? await admin.from('consent_evidence_attestations').select('*').in('record_id', ids).order('created_at')
    : { data: [] };
  return { records, attestations: (att ?? []) as AttestationRow[] };
}

export function decryptIp(r: EvidenceRow): string | null {
  if (!r.ip_enc) return null;
  try {
    return decryptString(r.ip_enc, r.user_id);
  } catch {
    return null;
  }
}

export type RecordCheck = {
  id: string;
  chain: boolean;
  signature: boolean;
  snapshot: boolean;
  record_hash: boolean;
  tsa: { ok: boolean; gen_time: string | null; url?: string; reason?: string };
  ots: { calendars: number };
  screenshot: { present: boolean; ok: boolean | null };
  email_receipt: boolean;
  problems: string[];
};

export async function verifyUserEvidence(admin: SupabaseClient, userId: string, opts: { checkImages?: boolean } = {}) {
  const { records, attestations } = await loadUserEvidence(admin, userId);
  const chain = verifyChain(records, publicKeyPem());
  const checks: RecordCheck[] = [];
  for (const r of records) {
    const c = chain.results.find((x) => x.id === r.id)!;
    const atts = attestations.filter((a) => a.record_id === r.id);
    const tsaRow = atts.find((a) => a.kind === 'tsa' && a.payload.token_b64);
    const tsa = tsaRow
      ? (() => {
          const v = verifyTsaResponse(Buffer.from(String(tsaRow.payload.token_b64), 'base64'), r.record_hash, String(tsaRow.payload.nonce ?? '') || undefined);
          return { ok: v.ok, gen_time: v.genTime, url: String(tsaRow.payload.url ?? ''), reason: v.reason };
        })()
      : { ok: false, gen_time: null, reason: 'missing' };
    const otsRow = atts.find((a) => a.kind === 'ots');
    let shot: RecordCheck['screenshot'] = { present: !!r.screenshot_sha256, ok: null };
    if (opts.checkImages && r.screenshot_sha256) {
      try {
        const img = await loadEvidenceImage(admin, userId, r.screenshot_storage, r.screenshot_key);
        let ok = !!img && sha256Hex(img) === r.screenshot_sha256;
        for (const sg of (r.screenshot_segments ?? []).filter((x) => x.i > 1)) {
          const b = await loadEvidenceImage(admin, userId, sg.storage, sg.key).catch(() => null);
          ok = ok && !!b && sha256Hex(b) === sg.sha256;
        }
        shot = { present: true, ok };
      } catch {
        shot = { present: true, ok: false };
      }
    }
    const problems = [...c.problems];
    if (!tsa.ok) problems.push(`tsa_${tsa.reason ?? 'invalid'}`);
    if (shot.ok === false) problems.push('screenshot_hash_mismatch');
    checks.push({
      id: r.id,
      chain: !c.problems.includes('chain_break'),
      signature: !c.problems.includes('signature_invalid'),
      snapshot: !c.problems.includes('snapshot_hash_mismatch'),
      record_hash: !c.problems.includes('record_hash_mismatch'),
      tsa,
      ots: { calendars: Array.isArray(otsRow?.payload.proofs) ? (otsRow!.payload.proofs as unknown[]).length : 0 },
      screenshot: shot,
      email_receipt: atts.some((a) => a.kind === 'email_receipt' && a.payload.ok === true),
      problems,
    });
  }
  return { ok: checks.every((c) => c.problems.length === 0), checkedAt: new Date().toISOString(), records, attestations, checks };
}

export async function auditLegalAccess(admin: SupabaseClient, actorId: string, path: string, detail: Record<string, unknown>) {
  const uid = typeof detail.user_id === 'string' && /^[0-9a-f-]{36}$/i.test(detail.user_id) ? detail.user_id : null;
  // Append-only legal log (excluded from retention). Never throws into the request path.
  await admin
    .from('legal_access_log')
    .insert({ actor_id: actorId, action: path, user_id: uid, detail })
    .then(
      () => undefined,
      () => undefined
    );
}

/** Reads the append-only legal access log for one user, shaped like the old audit rows. */
export async function loadLegalAccessLog(admin: SupabaseClient, userId: string, limit: number) {
  const { data } = await admin.from('legal_access_log').select('created_at, actor_id, action').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  return ((data ?? []) as { created_at: string; actor_id: string | null; action: string }[]).map((r) => ({ created_at: r.created_at, actor_id: r.actor_id, path: r.action }));
}
