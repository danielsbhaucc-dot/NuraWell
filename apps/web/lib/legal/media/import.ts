import 'server-only';
/**
 * One-click import of an evidence bundle (ZIP + import.json) collected outside the app
 * (Gmail receipts, vendor support replies, phone screenshots). Every file → permanent blob +
 * signed/timestamped record; idempotent (re-import skips what exists).
 */
import { unzipSync } from 'fflate';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '../evidence-crypto';
import { appendMediaEvidence } from './record';
import { storeMediaBlob } from './store';
import { addAttachment, loadAsset, provenanceInputSchema, updateProvenance } from './provenance';
import { scanStorage } from './ingest';
import { relinkAsset } from './links';
import { parseAmount, receiptTextFromFile } from './receipts-core';

const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
export const importSchema = z.object({
  receipts: z.array(z.object({ files: z.array(z.string()).min(1), vendor: z.string(), plan: z.string().nullable().optional(), subject: z.string().max(300).optional(), receipt_date: d, period_start: d, period_end: d, amount: z.number().nullable().optional(), currency: z.string().nullable().optional(), trust: z.enum(['verified', 'review']).default('review'), note: z.string().max(1000).optional() })).default([]),
  assets: z.array(z.object({ key: z.string(), provenance: provenanceInputSchema.optional(), attachments: z.array(z.object({ file: z.string(), label: z.string().max(120) })).default([]) })).default([]),
}).strict();

const MIME: Record<string, string> = { pdf: 'application/pdf', html: 'text/html', json: 'application/json', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', eml: 'message/rfc822' };
const mimeOf = (n: string) => MIME[n.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

export async function importEvidenceBundle(admin: SupabaseClient, zip: Buffer, actorId: string) {
  const files = unzipSync(new Uint8Array(zip));
  const spec = importSchema.parse(JSON.parse(Buffer.from(files['import.json'] ?? new Uint8Array()).toString('utf8') || '{}'));
  const get = (n: string) => { const f = files[n]; if (!f) throw new Error(`missing ${n}`); return Buffer.from(f); };
  const out = { receipts_new: 0, receipts_skipped: 0, attachments: 0, provenance: 0, files: [] as Array<{ file: string; sha256: string }> };

  for (const r of spec.receipts) {
    const key = sha256Hex(get(r.files[0]!));
    const { data: dup } = await admin.from('media_receipts').select('id').eq('eml_sha', key).maybeSingle();
    if (dup) { out.receipts_skipped++; continue; }
    const atts = [];
    for (const f of r.files) {
      const b = get(f); const s = await storeMediaBlob(admin, b, mimeOf(f));
      if (!s) throw new Error(`store ${f}`);
      atts.push({ sha256: s.sha256, name: f.split('/').pop()!, mime: mimeOf(f), bytes: b.length });
      out.files.push({ file: f, sha256: s.sha256 });
    }
    // import.json rarely carries the amount; read it from the bundled mail (.json/.html) like the inbound path does.
    let amount = r.amount ?? null; let currency = r.currency ?? null;
    if (amount === null) for (const f of r.files) { const t = receiptTextFromFile(f, get(f)); if (!t) continue; const p = parseAmount(t); if (p.amount !== null) { amount = p.amount; currency = currency ?? p.currency; break; } }
    const row = { source: 'upload', vendor: r.vendor, plan: r.plan ?? null, amount, currency, receipt_date: r.receipt_date ?? null, period_start: r.period_start ?? null, period_end: r.period_end ?? null, subject: r.subject ?? r.files[0]!, original_from: null, forwarder_ok: true, trust: r.trust, eml_sha: key, attachments: atts };
    // Idempotent: unique index on eml_sha; a concurrent insert of the same file is a skip, not a twin.
    const { data: ins, error } = await admin.from('media_receipts').insert(row).select('id').single();
    if (error?.code === '23505') { out.receipts_skipped++; continue; }
    if (error) throw new Error(error.message);
    const id = (ins as { id: string }).id;
    const rec = await appendMediaEvidence(admin, `receipt:${id}`, 'receipt', { ...row, note: r.note ?? null, imported_by: actorId, imported_at: new Date().toISOString(), method: 'bundle_import' });
    if (rec.ok) await admin.from('media_receipts').update({ record_hash: rec.recordHash }).eq('id', id);
    out.receipts_new++;
  }

  const finish = async () => { await relinkAsset(admin).catch(() => 0); };
  for (const a of spec.assets) {
    if (!(await loadAsset(admin, a.key)) && a.key.startsWith('db:')) await scanStorage(admin, { only: a.key.slice(3) });
    const cur = await loadAsset(admin, a.key);
    if (!cur) throw new Error(`asset ${a.key} not found`);
    if (a.provenance) { const r = await updateProvenance(admin, a.key, a.provenance, { id: actorId }); if (r.ok) out.provenance++; }
    const have = new Set((cur.provenance?.attachments ?? []).map((x) => x.sha256));
    for (const f of a.attachments) {
      const b = get(f.file);
      out.files.push({ file: f.file, sha256: sha256Hex(b) });
      if (have.has(sha256Hex(b))) continue;
      const r = await addAttachment(admin, a.key, { bytes: b, name: f.file.split('/').pop()!, mime: mimeOf(f.file), label: f.label }, { id: actorId });
      if (r.ok) out.attachments++;
    }
  }
  await finish();
  return out;
}

/** Drain queued bundles (oldest first). Bytes are dropped after import; the result + SHA stay. */
export async function processImportQueue(admin: SupabaseClient, max = 2) {
  const { data } = await admin.from('media_import_queue').select('id, zip_sha, zip_b64, actor_id').is('processed_at', null).order('created_at').limit(max);
  const done: Array<{ sha: string; ok: boolean }> = [];
  for (const q of (data ?? []) as Array<{ id: string; zip_sha: string; zip_b64: string; actor_id: string }>) {
    // Atomic claim: only one drain (panel open / scheduled run) may process a bundle. Stale claims (>10 min) are retaken.
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: claimed } = await admin.from('media_import_queue').update({ claimed_at: new Date().toISOString() }).eq('id', q.id).is('processed_at', null).or(`claimed_at.is.null,claimed_at.lt."${stale}"`).select('id');
    if (!claimed?.length) continue;
    const zip = Buffer.from(q.zip_b64, 'base64');
    let result: Record<string, unknown>;
    if (sha256Hex(zip) !== q.zip_sha) result = { ok: false, error: 'sha_mismatch' };
    else try { const r = await importEvidenceBundle(admin, zip, q.actor_id); result = { ok: true, receipts_new: r.receipts_new, receipts_skipped: r.receipts_skipped, attachments: r.attachments, provenance: r.provenance, files: r.files }; }
    catch (e) { result = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'import_failed' }; }
    await admin.from('media_import_queue').update({ processed_at: new Date().toISOString(), result, zip_b64: result.ok ? '' : q.zip_b64 }).eq('id', q.id);
    done.push({ sha: q.zip_sha, ok: !!result.ok });
  }
  return done;
}
