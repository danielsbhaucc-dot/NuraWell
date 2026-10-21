import 'server-only';
/** "אני צריך ראיה" for one media asset: ZIP = PDF + original file + every signed record + TSA/OTS proofs + snapshots + receipts + git proof. */
import { zipSync, strToU8 } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicKeyPem, publishedSigningKeys, sha256Hex } from '../evidence-crypto';
import { buildEvidenceViewer, type ViewerRecord } from '../evidence-viewer';
import { buildOtsFile, type OtsProof } from '../ots';
import { buildMediaEvidencePdf } from './pdf';
import { loadAsset, verifyMediaAsset } from './provenance';
import { loadMediaBlob } from './store';
import { imageFacts } from './image';
import type { EmbeddedMeta } from './core';
import { GENERATORS, type Provenance } from './labels';
import { commercialAssessment, dossierGaps, hasVendorStatement, GENERATOR_PROVIDER, pickTermsVersion, PROVIDER_TERMS } from './terms-core';
import { loadTermsHistory, snapshotProviderTerms } from './terms';

const REPO_URL = 'https://github.com/danielsbhaucc-dot/NuraWell';

const VERIFY_GUIDE = `מדריך אימות עצמאי — תיק ראיות למקור מדיה
=================================================
file/<name>                הקובץ המקורי כפי שתועד
records/NN-<event>/        כל רשומה: payload.json, record.sha256, signature.b64, timestamp.tsr, *.ots
snapshots/                 עמודי מקור/רישיון/תנאי שימוש כפי שנשמרו (גיבוב בתוך הרשומה)
attachments/               קבלות, חשבוניות, צילומי מסך שצורפו
git-proof.txt              commit ראשון ואחרון + פקודות לבדיקה מול המאגר

1) הקובץ: sha256sum file/*   # זהה ל-"sha256" ב-payload.json של רשומת הסריקה האחרונה
2) רשומה: sha256sum records/01-*/payload.json   # זהה ל-record.sha256
   שרשרת: prev_hash ברשומה N == record.sha256 של N-1 (הראשונה: GENESIS)
3) חתימה (OpenSSL 3):
   printf %s "$(cat records/01-scan/record.sha256)" > /tmp/m && base64 -d records/01-scan/signature.b64 > /tmp/s
   openssl pkeyutl -verify -pubin -inkey public-key.pem -rawin -in /tmp/m -sigfile /tmp/s
4) חותמת זמן: openssl ts -verify -digest $(cat records/01-scan/record.sha256) -in records/01-scan/timestamp.tsr -CAfile cacert.pem -untrusted tsa.crt
5) עיגון ציבורי: pip install opentimestamps-client && ots upgrade records/01-scan/*.ots && ots verify -d $(cat records/01-scan/record.sha256) records/01-scan/<file>.ots
6) git: git clone ${REPO_URL} && git log --follow --format='%H %aI %an %s' -- <path>
7) SHA256SUMS.txt מכיל גיבוב לכל קובץ בתיק.
`;

const ext = (mime: string | null) => ({ 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'font/ttf': 'ttf', 'text/html': 'html', 'application/pdf': 'pdf' } as Record<string, string>)[mime ?? ''] ?? 'bin';
const safe = (s: string) => s.replace(/[^\w.\-א-ת]+/g, '_').slice(0, 80);

export async function buildMediaEvidencePackage(admin: SupabaseClient, key: string, actor: { label: string }) {
  const a = await loadAsset(admin, key);
  if (!a) return null;
  const file = a.file_blob_sha ? await loadMediaBlob(admin, a.file_blob_sha).catch(() => null) : null;
  const v = await verifyMediaAsset(admin, key, file?.bytes ?? null);
  const files: Record<string, Uint8Array> = {};
  const baseName = safe((a.path ?? a.title ?? key).split('/').pop() || 'asset');
  if (file) files[`file/${/\.\w{2,5}$/.test(baseName) ? baseName : `${baseName}.${ext(a.mime)}`}`] = new Uint8Array(file.bytes);

  const snapshots: Array<{ url: string; at: string; status: number; sha: string | null; wayback: string | null }> = [];
  const attachments: Array<{ name: string; label: string; sha256: string }> = [];
  const pdfRecords = [];
  const viewerRecords: ViewerRecord[] = [];
  const EV_HE: Record<string, string> = { scan: 'סריקה ותיעוד הקובץ', provenance: 'עדכון מקור וזכויות', license_snapshot: 'שמירת עמוד רישיון', attachment: 'מסמך מצורף', ai_describe: 'תיאור אוטומטי', receipt: 'קבלה', receipt_update: 'עדכון קבלה' };
  for (const [idx, r] of v.records.entries()) {
    const n = String(idx + 1).padStart(2, '0');
    const dir = `records/${n}-${r.event}`;
    files[`${dir}/payload.json`] = strToU8(r.payload_json);
    files[`${dir}/record.sha256`] = strToU8(r.record_hash);
    files[`${dir}/signature.b64`] = strToU8(r.signature);
    const tsa = v.attestations.find((x) => x.record_id === r.id && x.kind === 'tsa' && x.payload.token_b64);
    if (tsa) files[`${dir}/timestamp.tsr`] = new Uint8Array(Buffer.from(String(tsa.payload.token_b64), 'base64'));
    const ots = v.attestations.find((x) => x.record_id === r.id && x.kind === 'ots');
    for (const pr of (ots?.payload.proofs as OtsProof[] | undefined) ?? []) files[`${dir}/${new URL(pr.calendar).hostname}.ots`] = new Uint8Array(buildOtsFile(r.record_hash, pr));
    const data = (JSON.parse(r.payload_json) as { data: Record<string, unknown> }).data;
    if (r.event === 'license_snapshot') {
      const sha = (data.blob_sha as string | null) ?? null;
      snapshots.push({ url: String(data.url), at: String(data.fetched_at), status: Number(data.http_status ?? 0), sha, wayback: (data.wayback as { url?: string } | null)?.url ?? null });
      if (sha) { const b = await loadMediaBlob(admin, sha).catch(() => null); if (b) files[`snapshots/${n}-${safe(new URL(String(data.url)).hostname + new URL(String(data.url)).pathname)}.${ext(b.mime)}`] = new Uint8Array(b.bytes); }
    }
    if (r.event === 'attachment') {
      const sha = String(data.sha256);
      attachments.push({ name: String(data.name), label: String(data.label), sha256: sha });
      const b = await loadMediaBlob(admin, sha).catch(() => null);
      if (b) files[`attachments/${n}-${safe(String(data.name))}`] = new Uint8Array(b.bytes);
    }
    const c = v.checks[idx]!;
    const vImgs: ViewerRecord['images'] = [];
    if (r.event === 'attachment') { const f = Object.entries(files).find(([k]) => k.startsWith(`attachments/${n}-`)); const mime = /\.png$/i.test(f?.[0] ?? '') ? 'image/png' : /\.jpe?g$/i.test(f?.[0] ?? '') ? 'image/jpeg' : /\.webp$/i.test(f?.[0] ?? '') ? 'image/webp' : null; if (f && mime) vImgs.push({ name: f[0].split('/').pop()!, mime, bytes: f[1], expected_sha256: String(data.sha256), caption: String(data.label ?? data.name) }); }
    viewerRecords.push({ n: idx + 1, title: EV_HE[r.event] ?? r.event, at: r.created_at, tone: 'info', reference: r.record_hash.slice(0, 12).toUpperCase(), payload_json: r.payload_json, record_hash: r.record_hash, prev_hash: r.prev_hash, signature: r.signature, key_id: r.signing_key_id ?? null, images: vImgs,
      fields: Object.entries(data).filter(([, x]) => typeof x === 'string' || typeof x === 'number').slice(0, 8).map(([k, x]) => [k, String(x).slice(0, 300)] as [string, string]),
      server_checks: [{ label: 'חותמת זמן', ok: c.tsa_ok }, { label: 'עיגון ציבורי', ok: (c.ots ?? 0) > 0 }] });
    pdfRecords.push({ n: idx + 1, event: r.event, at: r.created_at, hash: r.record_hash, prev: r.prev_hash, signature: r.signature, keyId: r.signing_key_id, tsaOk: c.tsa_ok, tsaTime: c.tsa_time, ots: c.ots, problems: c.problems });
  }
  const fc = a.first_commit;
  const lc = a.last_commit;
  if (fc) {
    files['git-proof.txt'] = strToU8([`מאגר: ${REPO_URL}`, `נתיב: ${a.path}`, `הופעה ראשונה: ${fc.sha} ${fc.date} ${fc.author} — ${fc.subject}`, `${REPO_URL}/commit/${fc.sha}`,
      lc ? `שינוי אחרון: ${lc.sha} ${lc.date} ${lc.author} — ${lc.subject}` : '', '', 'בדיקה:', `git log --follow --format='%H %aI %an %s' -- ${a.path}`, `git show ${fc.sha} --stat`].join('\n'));
  }
  // Rights dossier for AI assets: service + plan, creation day, file hash, covering receipt, terms in force that day.
  const prov = (a.provenance ?? {}) as Provenance;
  let dossier: Record<string, unknown> | null = null;
  if (/^ai_/.test(String(prov.source_type ?? a.source_type))) {
    const provider = prov.generator ? GENERATOR_PROVIDER[prov.generator] : null;
    const terms: Array<Record<string, unknown>> = [];
    if (provider) {
      await snapshotProviderTerms(admin, [provider]).catch(() => undefined);
      const hist = await loadTermsHistory(admin, provider);
      for (const url of PROVIDER_TERMS[provider].urls) {
        const pick = pickTermsVersion(hist, url, prov.created_on ?? null);
        if (!pick) { terms.push({ url, found: false }); continue; }
        const b = await loadMediaBlob(admin, pick.snap.sha256!).catch(() => null);
        const name = `terms/${provider}/${safe(new URL(url).hostname + new URL(url).pathname)}-${pick.snap.fetched_at.slice(0, 10)}.${ext(b?.mime ?? 'text/html')}`;
        if (b) files[name] = new Uint8Array(b.bytes);
        terms.push({ url, found: true, file: b ? name : null, sha256: pick.snap.sha256, fetched_at: pick.snap.fetched_at, from_creation_day_or_before: pick.exact });
      }
    }
    const ids = (prov.receipt_ids as string[] | undefined) ?? [];
    const { data: rc } = ids.length ? await admin.from('media_receipts').select('id, vendor, plan, amount, currency, receipt_date, period_start, period_end, trust, eml_sha, record_hash').in('id', ids) : { data: [] };
    const receipts = (rc ?? []) as Array<Record<string, unknown>>;
    for (const r of receipts) {
      const sha = r.eml_sha as string | null;
      if (!sha) continue;
      const b = await loadMediaBlob(admin, sha).catch(() => null);
      if (b) files[`receipts/${safe(String(r.vendor))}-${String(r.receipt_date ?? r.period_start ?? 'x')}-${String(r.id).slice(0, 8)}.eml`] = new Uint8Array(b.bytes);
    }
    const vendorStatements = (prov.attachments ?? []).filter((x) => (x.label ?? '').startsWith('הצהרת ספק'));
    const commercial = commercialAssessment(prov.generator ?? null, prov.plan ?? null, { vendorStatement: hasVendorStatement(prov.attachments) });
    const gaps = dossierGaps({ generator: prov.generator ?? null, plan: prov.plan ?? null, created_on: prov.created_on ?? null, sha256: a.sha256, receipt_ids: ids,
      terms_found: terms.filter((t) => t.found).length, terms_exact: terms.filter((t) => t.from_creation_day_or_before).length });
    dossier = { service: prov.generator ? GENERATORS[prov.generator].label : null, plan_at_creation: prov.plan ?? null, created_on: prov.created_on ?? null, file_sha256: a.sha256,
      receipts: receipts.map(({ eml_sha: _e, ...r }) => r), terms, vendor_written_statements: vendorStatements.map((x) => ({ name: x.name, label: x.label, sha256: x.sha256, kind: 'vendor written statement: commercial rights granted upon purchased download or download while Pro subscriber, permanent after cancel', note: 'replies generated by the vendor AI support assistant' })), commercial_use: commercial, gaps,
      note: 'סיכום לפי תנאי השימוש של הספק, לא ייעוץ משפטי.' };
    files['rights-dossier.json'] = strToU8(JSON.stringify(dossier, null, 2));
  }
  const { data: anchors } = await admin.from('media_evidence_attestations').select('created_at, digest, payload').eq('kind', 'chain_anchor').order('created_at', { ascending: false }).limit(30);
  const meta = (a.metadata ?? {}) as EmbeddedMeta & Record<string, unknown>;
  const embedded: Array<[string, string]> = [];
  if (meta.c2pa) embedded.push(['C2PA', meta.c2pa_claim_generator ?? 'קיים']);
  if (meta.software) embedded.push(['תוכנה', String(meta.software)]);
  if (meta.digital_source_type) embedded.push(['DigitalSourceType', String(meta.digital_source_type)]);
  if (meta.id3) embedded.push(['ID3', Object.entries(meta.id3).map(([k, x]) => `${k}: ${x}`).join(' · ')]);
  const preview = file && a.mime?.startsWith('image/') ? (await imageFacts(file.bytes, a.mime)).thumbJpeg : null;
  const generatedAt = new Date().toISOString();
  const caseRef = `NW-MEDIA-${generatedAt.slice(0, 10).replace(/-/g, '')}-${sha256Hex(key + generatedAt).slice(0, 6).toUpperCase()}`;
  const pdf = await buildMediaEvidencePdf({
    caseRef, generatedAt, generatedBy: actor.label,
    asset: { key, title: a.title ?? a.path ?? key, kind: a.kind, origin: a.origin, path: a.path, mime: a.mime, bytes: a.bytes, width: a.width, height: a.height, sha256: a.sha256, phash: a.phash, usages: a.usages ?? [], status: a.status, ai_description: a.ai_description },
    provenance: a.provenance ?? {}, missing: a.missing ?? [], preview,
    git: { first: fc ? { ...fc, url: `${REPO_URL}/commit/${fc.sha}` } : null, last: lc, commits: (meta.commits as number | null) ?? null },
    embedded, snapshots, attachments, records: pdfRecords, overallOk: v.ok, fileOk: v.file_ok,
    anchors: ((anchors ?? []) as Array<{ created_at: string; digest: string; payload: { count?: number } }>).reverse().map((x) => ({ at: x.created_at, head: x.digest, count: Number(x.payload.count ?? 0) })),
  });
  files['evidence-report.pdf'] = new Uint8Array(pdf);
  files['public-key.pem'] = strToU8(publicKeyPem());
  if (preview && viewerRecords[0]) viewerRecords[0].images.unshift({ name: 'preview.jpg', mime: 'image/jpeg', bytes: new Uint8Array(preview), expected_sha256: null, caption: 'תצוגה מקדימה של הקובץ' });
  files['תיק-ראיות.html'] = strToU8(await buildEvidenceViewer({
    kind: 'media', case_ref: caseRef, generated_at: generatedAt, generated_by: actor.label, title: `תיק מדיה · ${a.title ?? a.path ?? key}`,
    subject: [['קובץ', a.title ?? a.path ?? key], ['סוג', a.kind], ['טביעת אצבע (SHA-256)', a.sha256 ?? '—'], ['מקור', String((a.provenance as { source_type?: string } | null)?.source_type ?? a.source_type)], ['בדיקת שלמות בשרת', v.ok ? 'תקין' : 'לא תקין']],
    overall_ok: v.ok, keys: publishedSigningKeys().map((k) => ({ key_id: k.key_id, pem: k.pem, status: k.status })), records: viewerRecords,
    notes: ['הקובץ המקורי נמצא בתיקייה file/ ואפשר לבדוק את טביעת האצבע שלו לפי VERIFY.txt.', ...(dossier ? [`זכויות: ${(dossier.commercial_use as { note_he: string }).note_he}`, `תיק זכויות: rights-dossier.json, תנאי הספק בתיקייה terms/ והקבלות בתיקייה receipts/.${(dossier.gaps as string[]).length ? ` חסר: ${(dossier.gaps as string[]).join(', ')}` : ''}`] : [])],
  }));
  files['VERIFY.txt'] = strToU8(VERIFY_GUIDE);
  files['evidence.json'] = strToU8(JSON.stringify({ case_ref: caseRef, generated_at: generatedAt, asset: { ...a, metadata: undefined }, integrity_ok: v.ok, rights_dossier: dossier, file_ok: v.file_ok, checks: v.checks, attestations: v.attestations, chain_anchors: anchors ?? [] }, null, 2));
  files['SHA256SUMS.txt'] = strToU8(Object.keys(files).sort().map((k) => `${sha256Hex(files[k]!)}  ${k}`).join('\n') + '\n');
  return { zip: Buffer.from(zipSync(files, { level: 6 })), files, pdf, caseRef, ok: v.ok, generatedAt, recordHashes: v.records.map((r) => r.record_hash) };
}
