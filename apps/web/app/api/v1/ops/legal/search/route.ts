import { nameMatches } from '@/lib/security/name-match';
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { expand, inRange, normalize, parseDates, wantsSemantic } from '@/lib/legal/hub/search-core';
import { semanticAssets } from '@/lib/legal/hub/semantic';
import { legalFuzzy, searchReceiptIds } from '@/lib/legal/media/receipts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Hit = { score?: number; type: 'media' | 'receipt' | 'consent' | 'evidence'; id: string; title: string; sub: string; href: string; links: Array<{ label: string; href: string }> };
const mediaHref = (k: string) => `/ops/legal?tab=media&asset=${encodeURIComponent(k)}`;
const receiptHref = (id: string) => `/ops/legal?tab=media&receipt=${encodeURIComponent(id)}#receipts`;

/** One box, every legal object: trigram-indexed ILIKE (no AI). Each hit carries its "belongs to" links both ways. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const raw = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  const q = raw.toLowerCase();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  // Forgiving: natural-language dates + bilingual synonyms + trigram typo tolerance + semantic (asset metadata only).
  const { range, rest } = parseDates(raw);
  const words = expand(normalize(rest).split(' ').filter(Boolean)).slice(0, 12);
  const esc = (w: string) => w.replace(/[%_\\,()]/g, "");
  const orLike = words.length ? words.map((w) => `search_text.ilike.%${esc(w)}%`).join(',') : null;
  const like = `%${esc(q)}%`;
  const hex = /^[0-9a-f]{6,64}$/.test(q);
  const db = createAdminClient();
  const semP = rest && wantsSemantic(rest) ? semanticAssets(rest).catch(() => []) : Promise.resolve([] as Array<{ id: string; score: number }>);
  const fuzP = legalFuzzy(db, rest);
  const mSel = 'asset_key, title, path, source_type, provenance, first_seen_at';
  const rSel = 'id, vendor, plan, subject, period_start, period_end, trust, receipt_date';
  const [mLike, rLike, prof, ev, ce, sem, fuz] = await Promise.all([
    orLike ? db.from('media_provenance_assets').select(mSel).or(orLike).eq('present', true).limit(60) : range ? db.from('media_provenance_assets').select(mSel).eq('present', true).limit(500) : Promise.resolve({ data: [] }),
    words.length ? searchReceiptIds(db, words.map(esc).filter(Boolean), 40).then(async (ids) => (ids.length ? db.from('media_receipts').select(rSel).in('id', ids) : { data: [] })) : range ? db.from('media_receipts').select(rSel).gte('receipt_date', range.from).lte('receipt_date', range.to).limit(100) : Promise.resolve({ data: [] }),
    // full_name is encrypted at rest (enc:v2): match in app after the read path decrypts, never ilike on ciphertext
    db.from('profiles').select('id, full_name').not('full_name', 'is', null).limit(5000).then((r) => ({ ...r, data: ((r.data ?? []) as Array<{ id: string; full_name: string | null }>).filter((x) => nameMatches(x.full_name, q)).slice(0, 10) })),
    hex ? db.from('media_evidence').select('asset_key, event, record_hash, created_at').like('record_hash', `${q}%`).limit(10) : Promise.resolve({ data: [] }),
    hex ? db.from('consent_evidence').select('user_id, action, record_hash, created_at').like('record_hash', `${q}%`).limit(10) : Promise.resolve({ data: [] }),
    semP, fuzP,
  ]);
  type M = { asset_key: string; title: string | null; path: string | null; source_type: string; provenance: { receipt_ids?: string[]; license_status?: string | null; generator?: string; created_on?: string | null } | null; first_seen_at: string | null };
  type R = { id: string; vendor: string; plan: string | null; subject: string | null; period_start: string | null; period_end: string | null; trust: string; receipt_date: string | null };
  const score = new Map<string, number>();
  const bump = (k: string, v: number) => score.set(k, (score.get(k) ?? 0) + v);
  const mediaMap = new Map<string, M>(((mLike.data ?? []) as M[]).map((x) => [x.asset_key, x]));
  for (const x of mediaMap.keys()) bump(`m:${x}`, 1);
  const extraM = [...fuz.filter((f) => f.kind === 'asset').map((f) => { bump(`m:${f.id}`, 1 + f.score); return f.id; }), ...sem.map((h) => { bump(`m:${h.id}`, 1.5 * h.score); return h.id; })].filter((k) => !mediaMap.has(k));
  if (extraM.length) { const { data } = await db.from('media_provenance_assets').select(mSel).in('asset_key', [...new Set(extraM)].slice(0, 60)); for (const x of (data ?? []) as M[]) mediaMap.set(x.asset_key, x); }
  const recMap = new Map<string, R>(((rLike.data ?? []) as R[]).map((x) => [x.id, x]));
  for (const x of recMap.keys()) bump(`r:${x}`, 1);
  const extraR = fuz.filter((f) => f.kind === 'receipt').map((f) => { bump(`r:${f.id}`, 1 + f.score); return f.id; }).filter((k) => !recMap.has(k));
  if (extraR.length) { const { data } = await db.from('media_receipts').select(rSel).in('id', extraR.slice(0, 40)); for (const x of (data ?? []) as R[]) recMap.set(x.id, x); }
  const media = [...mediaMap.values()].filter((x) => inRange(x.provenance?.created_on ?? x.first_seen_at, range)).sort((p, q2) => (score.get(`m:${q2.asset_key}`) ?? 0) - (score.get(`m:${p.asset_key}`) ?? 0)).slice(0, 20);
  const recs = [...recMap.values()].filter((x) => inRange(x.receipt_date ?? x.period_start, range)).sort((p, q2) => (score.get(`r:${q2.id}`) ?? 0) - (score.get(`r:${p.id}`) ?? 0)).slice(0, 15);
  const hits: Hit[] = [];
  const covered = new Map<string, Array<{ key: string; title: string }>>();
  if (recs.length) {
    const { data } = await db.from('media_provenance_assets').select('asset_key, title, provenance').or(recs.map((x) => `provenance->receipt_ids.cs.["${x.id}"]`).join(',')).limit(200);
    for (const a of (data ?? []) as Array<{ asset_key: string; title: string | null; provenance: { receipt_ids?: string[] } }>)
      for (const id of a.provenance?.receipt_ids ?? []) covered.set(id, [...(covered.get(id) ?? []), { key: a.asset_key, title: a.title ?? a.asset_key }]);
  }
  for (const a of media) hits.push({
    score: score.get(`m:${a.asset_key}`), type: 'media', id: a.asset_key, title: a.title ?? a.path ?? a.asset_key,
    sub: [a.source_type, a.provenance?.generator, a.provenance?.license_status === 'pending' ? 'רישיון ממתין' : null].filter(Boolean).join(' · '),
    href: mediaHref(a.asset_key),
    links: (a.provenance?.receipt_ids ?? []).map((id) => ({ label: 'קבלה', href: receiptHref(id) })),
  });
  for (const x of recs) hits.push({
    type: 'receipt', id: x.id, title: x.subject ?? x.vendor, sub: [x.vendor, x.plan, x.period_start && `${x.period_start}–${x.period_end ?? '?'}`, x.trust === 'review' ? 'לבדיקה' : null].filter(Boolean).join(' · '),
    href: receiptHref(x.id), links: (covered.get(x.id) ?? []).map((a) => ({ label: a.title, href: mediaHref(a.key) })),
  });
  for (const p of (prof.data ?? []) as Array<{ id: string; full_name: string | null }>) hits.push({ type: 'consent', id: p.id, title: p.full_name ?? p.id, sub: 'הסכמות משתמש', href: `/ops/legal?tab=consent&user=${p.id}`, links: [] });
  for (const e of (ev.data ?? []) as Array<{ asset_key: string; event: string; record_hash: string; created_at: string }>) hits.push({ type: 'evidence', id: e.record_hash, title: `רשומת ${e.event}`, sub: e.record_hash.slice(0, 16), href: mediaHref(e.asset_key), links: [{ label: 'הפריט', href: mediaHref(e.asset_key) }] });
  for (const e of (ce.data ?? []) as Array<{ user_id: string; action: string; record_hash: string }>) hits.push({ type: 'evidence', id: e.record_hash, title: `הסכמה (${e.action === 'grant' ? 'מתן' : 'ביטול'})`, sub: e.record_hash.slice(0, 16), href: `/ops/legal?tab=consent&user=${e.user_id}`, links: [] });
  return NextResponse.json({ hits, range: range?.label ?? null, semantic: sem.length > 0 });
}
