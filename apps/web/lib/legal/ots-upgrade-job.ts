import type { SupabaseClient } from '@supabase/supabase-js';
import { otsUpgradeProof, type OtsProof } from './ots';

type Row = { id: number; record_id: string | null; kind: string; digest: string; payload: Record<string, unknown>; created_at: string };

/**
 * Daily: for every OTS proof (per-record `ots` + `chain_anchor.ots`) younger than 60 days without a
 * completed upgrade, ask its calendar for the Bitcoin-attested path. Completed proofs are stored as NEW
 * append-only `ots_upgrade` attestation rows (the table rejects UPDATE/DELETE).
 */
export async function runOtsUpgrade(admin: SupabaseClient, opts: { limit?: number; fetchImpl?: typeof fetch } = {}) {
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: src, error } = await admin
    .from('consent_evidence_attestations')
    .select('id, record_id, kind, digest, payload, created_at')
    .in('kind', ['ots', 'chain_anchor'])
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(opts.limit ?? 300);
  if (error) throw new Error('load_failed');
  const ids = (src ?? []).map((r) => (r as Row).id);
  const done = new Set<string>();
  if (ids.length) {
    const { data: ups } = await admin.from('consent_evidence_attestations').select('payload').eq('kind', 'ots_upgrade').gte('created_at', since).limit(5000);
    for (const u of ups ?? []) {
      const p = (u as { payload: { source_attestation_id?: number; calendar?: string } }).payload;
      if (p?.source_attestation_id != null) done.add(`${p.source_attestation_id}|${p.calendar}`);
    }
  }
  const stats = { checked: 0, completed: 0, pending: 0, errors: 0, skipped: 0 };
  for (const raw of src ?? []) {
    const row = raw as Row;
    const proofs = (row.kind === 'ots' ? row.payload.proofs : row.payload.ots) as OtsProof[] | undefined;
    if (!Array.isArray(proofs)) continue;
    for (const proof of proofs) {
      if (!proof?.calendar || !proof.responseB64) continue;
      if (done.has(`${row.id}|${proof.calendar}`)) {
        stats.skipped++;
        continue;
      }
      stats.checked++;
      const r = await otsUpgradeProof(row.digest, proof, opts.fetchImpl);
      if (r.status === 'complete') {
        const { error: insErr } = await admin.from('consent_evidence_attestations').insert({
          record_id: row.record_id,
          kind: 'ots_upgrade',
          digest: row.digest,
          payload: { source_attestation_id: row.id, source_kind: row.kind, calendar: r.calendar, commitment: r.commitmentHex, upgrade_b64: r.responseB64, bitcoin_height: r.bitcoinHeight },
        });
        if (insErr) stats.errors++;
        else {
          stats.completed++;
          done.add(`${row.id}|${proof.calendar}`);
        }
      } else if (r.status === 'pending') stats.pending++;
      else stats.errors++;
    }
  }
  return stats;
}
