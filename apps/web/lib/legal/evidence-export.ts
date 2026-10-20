import 'server-only';
import { zipSync, strToU8 } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicKeyFingerprint, publicKeyPem, sha256Hex } from './evidence-crypto';
import { buildProvenance, chainNeighbors, corroboration, otsStatus, tsaName } from './evidence-provenance';
import { publicAppOriginSync } from '@/lib/public-app-url';
import { buildOtsFile, type OtsProof } from './ots';
import { buildEvidencePdf, type PdfEvent } from './evidence-pdf';
import { decryptIp, loadLegalAccessLog, verifyUserEvidence, type EvidenceRow } from './evidence-verify';
import { loadEvidenceImage } from './evidence-storage';

export function referenceFor(r: { created_at: string; record_hash: string }) {
  return `NW-${r.created_at.slice(0, 10).replace(/-/g, '')}-${r.record_hash.slice(0, 8).toUpperCase()}`;
}

export function htmlToLines(html: string): string[] {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<input type="checkbox"[^>]*checked[^>]*>/g, '[V] ')
    .replace(/<input type="checkbox"[^>]*>/g, '[ ] ')
    .replace(/<input type="text" value="([^"]*)"[^>]*>/g, 'הוקלד: $1')
    .replace(/<li>/g, '• ')
    .replace(/<\/(h2|h3|p|li|label|section|aside|button)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export const PUBLIC_KEY_PATH = '/.well-known/nurawell-consent-signing.pem';

export const verifyGuide = (fp: string, url: string, tsa: string) => `מדריך אימות עצמאי — לעורך דין או למומחה
=================================================
לכל רשומה בתיקייה records/NN-*:
  payload.json      הרשומה הקנונית שנחתמה
  record.sha256     גיבוב הרשומה
  signature.b64     חתימת Ed25519 של השרת על הגיבוב (כמחרוזת hex)
  snapshot.html     הנוסח המדויק שהוצג
  screenshot.webp   צילום החלון (אם קיים)
  timestamp.tsr     אסימון חותמת זמן RFC 3161
  *.ots             הוכחות עיגון OpenTimestamps

1) גיבוב הרשומה:
   sha256sum records/01/payload.json      # חייב להיות זהה ל-record.sha256
2) שרשרת: prev_hash בתוך payload.json של רשומה N שווה ל-record.sha256 של רשומה N-1 (הראשונה: GENESIS).
3) חתימה (OpenSSL 3):
   printf %s "$(cat records/01/record.sha256)" > /tmp/m && base64 -d records/01/signature.b64 > /tmp/s
   openssl pkeyutl -verify -pubin -inkey public-key.pem -rawin -in /tmp/m -sigfile /tmp/s
4) חותמת זמן (FreeTSA: https://freetsa.org/files/cacert.pem + tsa.crt; DigiCert: שרשרת התעודות הציבורית):
   openssl ts -verify -digest $(cat records/01/record.sha256) -in records/01/timestamp.tsr -CAfile cacert.pem -untrusted tsa.crt
5) עיגון ציבורי (pip install opentimestamps-client):
   ots upgrade records/01/*.ots && ots verify -d $(cat records/01/record.sha256) records/01/<file>.ots
6) נוסח וצילום: sha256sum של snapshot.html ושל screenshot.webp חייבים להיות זהים ל-rendered_sha256 ול-screenshot_sha256 ב-payload.json.
7) SHA256SUMS.txt מכיל גיבוב לכל קובץ בתיק.
8) מפתח ציבורי עצמאי (לא רק מהתיק):
   curl -s ${url} -o pub.pem && cmp pub.pem public-key.pem
   openssl pkey -pubin -in pub.pem -outform DER | sha256sum     # = ${fp}
9) רשות חותמת הזמן: ${tsa}. הנתונים שנחתמו: openssl ts -reply -in records/01/timestamp.tsr -text
10) יומני שרת גולמיים לכל אירוע: records/NN/server-log.jsonl (שורות audit שנרשמו בטבלאות נפרדות באותה בקשה)
    ו-records/NN/chain.txt (גיבובי הרשומה הקודמת והבאה).
`;

export async function buildEvidencePackage(admin: SupabaseClient, userId: string, actor: { id: string; label: string }) {
  const v = await verifyUserEvidence(admin, userId, { checkImages: true });
  const { data: au } = await admin.auth.admin.getUserById(userId);
  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const logs = await loadLegalAccessLog(admin, userId, 60);
  const { data: anchors } = await admin.from('consent_evidence_attestations').select('created_at, digest, payload').eq('kind', 'chain_anchor').order('created_at', { ascending: false }).limit(30);

  const { data: auditRows } = await admin.from('admin_audit_log').select('id, created_at, method, path, detail').eq('actor_id', userId).eq('method', 'PRIVACY').order('created_at').limit(500);
  const { data: consentRows } = await admin.from('user_consents').select('created_at, granted, source, policy_version').eq('user_id', userId).eq('consent_type', 'health_data').order('created_at').limit(500);
  const pubPem = publicKeyPem();
  const fingerprint = publicKeyFingerprint(pubPem);
  const keyUrl = `${publicAppOriginSync()}${PUBLIC_KEY_PATH}`;
  const tsaUrl = v.attestations.find((a) => a.kind === 'tsa' && a.payload.url)?.payload.url as string | undefined;
  const files: Record<string, Uint8Array> = {};
  const events: PdfEvent[] = [];
  const sharp = (await import('sharp')).default;
  for (const [i, r] of (v.records as EvidenceRow[]).entries()) {
    const n = String(i + 1).padStart(2, '0');
    const dir = `records/${n}`;
    const check = v.checks[i]!;
    const atts = v.attestations.filter((a) => a.record_id === r.id);
    const tsaRow = atts.find((a) => a.kind === 'tsa' && a.payload.token_b64);
    const otsRow = atts.find((a) => a.kind === 'ots');
    const mail = atts.find((a) => a.kind === 'email_receipt');
    files[`${dir}/payload.json`] = strToU8(r.payload_json);
    files[`${dir}/record.sha256`] = strToU8(r.record_hash);
    files[`${dir}/signature.b64`] = strToU8(r.signature);
    files[`${dir}/snapshot.html`] = strToU8(r.rendered_html);
    let png: Buffer | null = null;
    let shotComputed: string | null = null;
    if (r.screenshot_sha256) {
      const img = await loadEvidenceImage(admin, userId, r.screenshot_storage, r.screenshot_key).catch(() => null);
      if (img) {
        files[`${dir}/screenshot.webp`] = new Uint8Array(img);
        shotComputed = sha256Hex(img);
        png = await sharp(img).png().toBuffer();
      }
    }
    const recs = v.records as EvidenceRow[];
    const nb = chainNeighbors(recs, i);
    const corr = corroboration(r, (auditRows ?? []) as never[], (consentRows ?? []) as never[]);
    files[`${dir}/chain.txt`] = strToU8(`prev ${nb.prevHash}\nthis ${r.record_hash}\nnext ${nb.nextHash ?? '-'}\n`);
    files[`${dir}/server-log.jsonl`] = strToU8(corr.map((c) => JSON.stringify({ table: c.source, at: c.at, row: JSON.parse(c.line) })).join('\n') + '\n');
    let tokenSha: string | undefined;
    if (tsaRow) {
      const tok = Buffer.from(String(tsaRow.payload.token_b64), 'base64');
      files[`${dir}/timestamp.tsr`] = new Uint8Array(tok);
      tokenSha = sha256Hex(tok);
    }
    const proofs = (otsRow?.payload.proofs as OtsProof[] | undefined) ?? [];
    proofs.forEach((pr) => {
      files[`${dir}/${new URL(pr.calendar).hostname}.ots`] = new Uint8Array(buildOtsFile(r.record_hash, pr));
    });
    const ip = decryptIp(r);
    events.push({
      index: i + 1,
      reference: referenceFor(r),
      createdAt: r.created_at,
      action: r.action,
      source: r.source,
      textVersion: r.text_version,
      displayedText: htmlToLines(r.rendered_html),
      typedWord: r.typed_word,
      checkbox: r.checkbox_checked,
      ip,
      ipHash: r.ip_hash,
      userAgent: r.user_agent,
      sessionId: r.session_id,
      deviceId: r.device_id,
      recordHash: r.record_hash,
      prevHash: r.prev_hash,
      renderedSha: r.rendered_sha256,
      screenshotSha: r.screenshot_sha256,
      screenshotPng: png,
      signature: r.signature,
      keyId: r.signing_key_id,
      tsa: { ok: check.tsa.ok, genTime: check.tsa.gen_time, url: check.tsa.url, tokenSha },
      otsCalendars: proofs.map((p) => new URL(p.calendar).hostname),
      screenshotShaComputed: r.screenshot_sha256 ? shotComputed : undefined,
      provenance: buildProvenance(r, ip, shotComputed, { url: check.tsa.url, genTime: check.tsa.gen_time }),
      corroboration: corr,
      canonicalJson: r.payload_json,
      neighbors: nb,
      otsStatus: otsStatus(r.id, v.attestations),
      tsaName: tsaName(check.tsa.url),
      emailReceipt: mail ? { ok: mail.payload.ok === true, sentAt: String(mail.payload.sent_at ?? '') } : null,
      checks: [
        { label: 'שרשרת', ok: check.chain && check.record_hash },
        { label: 'חתימה', ok: check.signature },
        { label: 'נוסח', ok: check.snapshot },
        { label: 'חותמת זמן', ok: check.tsa.ok },
        { label: 'צילום', ok: check.screenshot.present ? check.screenshot.ok : null },
        { label: 'עיגון ציבורי', ok: check.ots.calendars > 0 },
        { label: 'קבלה בדוא"ל', ok: check.email_receipt },
      ],
    });
  }
  const generatedAt = new Date().toISOString();
  const caseRef = `NW-CASE-${generatedAt.slice(0, 10).replace(/-/g, '')}-${sha256Hex(userId + generatedAt).slice(0, 6).toUpperCase()}`;
  const pdf = await buildEvidencePdf({
    caseRef,
    generatedAt,
    generatedBy: actor.label,
    user: { name: (prof as { full_name?: string } | null)?.full_name || '—', email: au.user?.email ?? '—', id: userId, createdAt: au.user?.created_at ?? null },
    events,
    overallOk: v.ok,
    publicKeyPem: pubPem,
    publicKeyFingerprint: fingerprint,
    publicKeyUrl: keyUrl,
    tsaName: tsaName(tsaUrl),
    accessLog: ((logs ?? []) as Array<{ created_at: string; actor_id: string | null; path: string }>).reverse().map((l) => ({ at: l.created_at, actor: l.actor_id === actor.id ? actor.label : (l.actor_id ?? 'system').slice(0, 8), action: l.path.replace('legal_', '').replace(/_/g, ' ') })),
    chainAnchors: ((anchors ?? []) as Array<{ created_at: string; digest: string; payload: Record<string, unknown> }>).reverse().map((a) => ({ at: a.created_at, head: a.digest, count: Number(a.payload.count ?? 0), tsa: !!(a.payload.tsa as { token_b64?: string } | undefined)?.token_b64, ots: Array.isArray(a.payload.ots) ? (a.payload.ots as unknown[]).length : 0 })),
  });
  files['evidence-report.pdf'] = new Uint8Array(pdf);
  files['public-key.pem'] = strToU8(publicKeyPem());
  files['VERIFY.txt'] = strToU8(verifyGuide(fingerprint, keyUrl, tsaName(tsaUrl)));
  files['evidence.json'] = strToU8(
    JSON.stringify(
      {
        case_ref: caseRef,
        generated_at: generatedAt,
        user_id: userId,
        integrity_ok: v.ok,
        checks: v.checks,
        records: (v.records as EvidenceRow[]).map((r) => ({ ...r, ip_enc: undefined, ip: decryptIp(r), reference: referenceFor(r) })),
        attestations: v.attestations,
        chain_anchors: anchors ?? [],
      },
      null,
      2
    )
  );
  files['SHA256SUMS.txt'] = strToU8(
    Object.keys(files)
      .sort()
      .map((k) => `${sha256Hex(files[k]!)}  ${k}`)
      .join('\n') + '\n'
  );
  return { zip: Buffer.from(zipSync(files, { level: 6 })), caseRef, pdf, ok: v.ok };
}
