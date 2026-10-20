import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { bestMatch, type MatchAsset, type MatchReceipt } from '@/lib/legal/hub/match';
import { syncAssetVectors } from '@/lib/legal/hub/semantic';
import { appendMediaEvidence } from '@/lib/legal/media/record';
import { VENDORS } from '@/lib/legal/media/receipts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store' };

type Asset = MatchAsset & { title: string | null; kind: string; status: string; mime: string | null; origin: string; public_url: string | null; file_blob_sha: string | null; updated_at: string; missing: string[] | null; provenance: MatchAsset['provenance'] & { receipt_ids?: string[]; license_status?: string | null } };
export type InboxItem = { id: string; kind: 'match' | 'missing_source' | 'missing_receipt' | 'receipt_review' | 'forwarding'; title: string; why: string; action: string; asset_key?: string; receipt_id?: string; confidence?: number; reasons?: string[] };

/** Hub overview: only what needs Daniel (with a plain Hebrew "why"), plus calm stats. Everything else resolves itself. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const [{ data: a }, { data: r }, { data: l }, { data: blobs }] = await Promise.all([
    db.from('media_provenance_assets').select('asset_key,title,kind,status,mime,origin,public_url,file_blob_sha,source_type,provenance,first_seen_at,updated_at,missing').eq('present', true).limit(3000),
    db.from('media_receipts').select('id,vendor,plan,amount,currency,receipt_date,period_start,period_end,trust,subject,source,confirmed_at').limit(1000),
    db.from('media_receipt_links').select('asset_key,receipt_id,status').limit(5000),
    db.from('media_evidence_blobs').select('bytes').limit(10000),
  ]);
  const assets = (a ?? []) as Asset[];
  const receipts = ((r ?? []) as Array<MatchReceipt & { source: string; confirmed_at: string | null }>);
  const paid = receipts.filter((x) => x.source !== 'gmail_confirmation');
  const decided = new Map<string, 'confirmed' | 'rejected'>(((l ?? []) as Array<{ asset_key: string; receipt_id: string; status: 'confirmed' | 'rejected' }>).map((x) => [`${x.asset_key}|${x.receipt_id}`, x.status]));
  const inbox: InboxItem[] = [];
  let autoLinked = 0; let confirmed = 0;
  const assetOut = assets.map((x) => {
    const ai = ['ai_music', 'ai_image', 'ai_voice'].includes(x.source_type);
    const has = (x.provenance?.receipt_ids ?? []).length > 0 || [...decided].some(([k, v]) => v === 'confirmed' && k.startsWith(`${x.asset_key}|`));
    const m = ai && !has ? bestMatch(x, paid, decided) : null;
    if (has) confirmed++;
    else if (m?.auto) autoLinked++;
    else if (m) inbox.push({ id: `match:${x.asset_key}:${m.receipt.id}`, kind: 'match', title: `${x.title ?? x.asset_key} בלי קבלה מאושרת`, why: `מצאתי קבלה שכנראה מתאימה (${m.confidence}%): ${m.reasons.join(' · ')}.`, action: 'לאשר התאמה', asset_key: x.asset_key, receipt_id: m.receipt.id, confidence: m.confidence, reasons: m.reasons });
    else if (ai && (x.provenance?.license_status === 'pending' || (x.missing ?? []).includes('attachments'))) inbox.push({ id: `nr:${x.asset_key}`, kind: 'missing_receipt', title: `${x.title ?? x.asset_key}: חסרה קבלה`, why: 'לא מצאתי קבלה מאותו ספק בתקופה שבה הקובץ נוצר. מעבירים את הקבלה מהמייל והיא תשויך לבד.', action: 'איך מעבירים', asset_key: x.asset_key });
    if (x.status === 'missing_source') inbox.push({ id: `ms:${x.asset_key}`, kind: 'missing_source', title: `${x.title ?? x.asset_key}: חסר מקור`, why: 'לא ידוע מאיפה הקובץ הגיע. בוחרים מקור אחד מהרשימה וזה נשמר וחתום.', action: 'להשלים מקור', asset_key: x.asset_key });
    return { key: x.asset_key, title: x.title, kind: x.kind, status: x.status, mime: x.mime, thumb: thumbFor(x), updated_at: x.updated_at, created_on: x.provenance?.created_on ?? x.first_seen_at?.slice(0, 10) ?? null, source_type: x.source_type,
      receipt: has ? 'confirmed' : m?.auto ? 'auto' : m ? 'suggested' : ai ? 'missing' : null, match: m ? { receipt_id: m.receipt.id, confidence: m.confidence, reasons: m.reasons, vendor: (VENDORS[m.receipt.vendor] as { label: string } | undefined)?.label ?? m.receipt.vendor, plan: m.receipt.plan, amount: m.receipt.amount, currency: m.receipt.currency, receipt_date: m.receipt.receipt_date } : null };
  });
  for (const x of paid.filter((x) => x.trust === 'review' || !x.period_start)) inbox.push({ id: `rr:${x.id}`, kind: 'receipt_review', title: `קבלה לבדיקה: ${x.subject?.slice(0, 60) ?? x.vendor}`, why: x.period_start ? 'לא הצלחתי לאמת את השולח. אם הקבלה אמיתית מאשרים בלחיצה.' : 'לא זוהתה תקופת המנוי. משלימים ספק ותאריכים.', action: 'לבדוק', receipt_id: x.id });
  for (const x of receipts.filter((x) => x.source === 'gmail_confirmation' && !x.confirmed_at)) inbox.push({ id: `fw:${x.id}`, kind: 'forwarding', title: 'אישור העברת מייל מחכה', why: 'Gmail מבקש לאשר את העברת הקבלות. לוחצים על הקישור פעם אחת.', action: 'לאשר', receipt_id: x.id });
  const verified = assets.filter((x) => x.status === 'verified').length;
  const evidenceBytes = ((blobs ?? []) as Array<{ bytes: number }>).reduce((s, b) => s + (b.bytes ?? 0), 0);
  after(() => syncAssetVectors(db).then(() => undefined, () => undefined));
  return NextResponse.json({
    inbox,
    stats: { assets: assets.length, verified, verified_pct: assets.length ? Math.round((verified / assets.length) * 100) : 100, receipts: paid.length, auto_linked: autoLinked, confirmed_links: confirmed, evidence_mb: Math.round(evidenceBytes / 1e5) / 10 },
    assets: assetOut.sort((p, q) => q.updated_at.localeCompare(p.updated_at)),
  }, { headers: NO_STORE });
}

function thumbFor(x: Asset): { type: 'image' | 'video' | 'cover' | 'none'; src: string | null } {
  const file = x.file_blob_sha ? `/api/v1/ops/legal/media/item/file?key=${encodeURIComponent(x.asset_key)}` : null;
  if (x.mime?.startsWith('image/') && x.mime !== 'image/svg+xml') return { type: 'image', src: x.origin === 'repo' && x.public_url ? x.public_url : file };
  if (x.mime === 'image/svg+xml' && x.origin === 'repo' && x.public_url) return { type: 'image', src: x.public_url };
  if (x.mime?.startsWith('video/') && file) return { type: 'video', src: `${file}#t=0.8` };
  if (x.mime?.startsWith('audio/') && file) return { type: 'cover', src: `${file}&cover=1` };
  return { type: 'none', src: null };
}

const linkBody = z.object({ op: z.literal('link'), asset_key: z.string().min(1).max(400), receipt_id: z.string().uuid(), decision: z.enum(['confirmed', 'rejected']), confidence: z.number().int().min(0).max(100).optional() });

/** Daniel confirms / rejects a suggested receipt. Confirmation is a signed, timestamped evidence record on the asset. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const p = linkBody.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = p.data; const db = createAdminClient();
  const { data: a } = await db.from('media_provenance_assets').select('asset_key, provenance, sha256, records').eq('asset_key', b.asset_key).maybeSingle();
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.from('media_receipt_links').upsert({ asset_key: b.asset_key, receipt_id: b.receipt_id, status: b.decision, confidence: b.confidence ?? 0, decided_by: auth.user.id, decided_at: new Date().toISOString() });
  if (b.decision === 'confirmed') {
    const prov = { ...((a as { provenance: Record<string, unknown> | null }).provenance ?? {}) } as { receipt_ids?: string[] };
    prov.receipt_ids = [...new Set([...(prov.receipt_ids ?? []), b.receipt_id])];
    const rec = await appendMediaEvidence(db, b.asset_key, 'provenance', { provenance: prov, receipt_link: { receipt_id: b.receipt_id, confidence: b.confidence ?? null, confirmed_by_owner: true }, actor_id: auth.user.id, file_sha256: (a as { sha256: string | null }).sha256 });
    await db.from('media_provenance_assets').update({ provenance: prov, ...(rec.ok ? { latest_record_hash: rec.recordHash, records: ((a as { records: number }).records ?? 0) + 1 } : {}), updated_at: new Date().toISOString() }).eq('asset_key', b.asset_key);
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
