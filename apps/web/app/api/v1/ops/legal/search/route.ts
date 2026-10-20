import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Hit = { type: 'media' | 'receipt' | 'consent' | 'evidence'; id: string; title: string; sub: string; href: string; links: Array<{ label: string; href: string }> };
const mediaHref = (k: string) => `/ops/legal?tab=media&asset=${encodeURIComponent(k)}`;
const receiptHref = (id: string) => `/ops/legal?tab=media&receipt=${encodeURIComponent(id)}#receipts`;

/** One box, every legal object: trigram-indexed ILIKE (no AI). Each hit carries its "belongs to" links both ways. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const hex = /^[0-9a-f]{6,64}$/.test(q);
  const db = createAdminClient();
  const [m, r, prof, ev, ce] = await Promise.all([
    db.from('media_provenance_assets').select('asset_key, title, path, source_type, provenance').ilike('search_text', like).limit(20),
    db.from('media_receipts').select('id, vendor, plan, subject, period_start, period_end, trust').ilike('search_text', like).limit(15),
    db.from('profiles').select('id, full_name').ilike('full_name', like).limit(10),
    hex ? db.from('media_evidence').select('asset_key, event, record_hash, created_at').like('record_hash', `${q}%`).limit(10) : Promise.resolve({ data: [] }),
    hex ? db.from('consent_evidence').select('user_id, action, record_hash, created_at').like('record_hash', `${q}%`).limit(10) : Promise.resolve({ data: [] }),
  ]);
  const hits: Hit[] = [];
  const recs = (r.data ?? []) as Array<{ id: string; vendor: string; plan: string | null; subject: string | null; period_start: string | null; period_end: string | null; trust: string }>;
  const media = (m.data ?? []) as Array<{ asset_key: string; title: string | null; path: string | null; source_type: string; provenance: { receipt_ids?: string[]; license_status?: string | null; generator?: string } | null }>;
  const covered = new Map<string, Array<{ key: string; title: string }>>();
  if (recs.length) {
    const { data } = await db.from('media_provenance_assets').select('asset_key, title, provenance').or(recs.map((x) => `provenance->receipt_ids.cs.["${x.id}"]`).join(',')).limit(200);
    for (const a of (data ?? []) as Array<{ asset_key: string; title: string | null; provenance: { receipt_ids?: string[] } }>)
      for (const id of a.provenance?.receipt_ids ?? []) covered.set(id, [...(covered.get(id) ?? []), { key: a.asset_key, title: a.title ?? a.asset_key }]);
  }
  for (const a of media) hits.push({
    type: 'media', id: a.asset_key, title: a.title ?? a.path ?? a.asset_key,
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
  return NextResponse.json({ hits });
}
