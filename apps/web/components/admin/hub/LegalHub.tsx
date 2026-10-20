'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronLeft, FileArchive, Images, Inbox, KeyRound, LayoutGrid, Loader2, Receipt, Search, Sparkles, UserCheck, X } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { AdminLegalPanel } from '@/components/admin/AdminLegalPanel';
import { AdminLegalPasswords } from '@/components/admin/AdminLegalPasswords';
import { AdminLegalGuide } from '@/components/admin/AdminLegalGuide';
import { AdminKeyBackup } from '@/components/admin/AdminKeyBackup';
import { AdminKmsWrap } from '@/components/admin/AdminKmsWrap';
import { ReceiptsSection } from '@/components/admin/MediaReceiptsSection';
import { StepUpSettings } from '@/components/admin/StepUpSettings';
import { AssetThumb, type Thumb } from './AssetThumb';
import { HubSearch } from './HubSearch';
import { AssetSheet } from './AssetSheet';
import { fuzzyScore, normalize, expand } from '@/lib/legal/hub/search-core';

export type HubTab = 'overview' | 'media' | 'receipts' | 'consent' | 'evidence' | 'keys';
export type HubAsset = { key: string; title: string | null; kind: string; status: string; mime: string | null; thumb: Thumb; updated_at: string; created_on: string | null; source_type: string;
  receipt: 'confirmed' | 'auto' | 'suggested' | 'missing' | null; match: { receipt_id: string; confidence: number; reasons: string[]; vendor: string; plan: string | null; amount: number | null; currency: string | null; receipt_date: string | null } | null };
type InboxItem = { id: string; kind: 'match' | 'missing_source' | 'missing_receipt' | 'receipt_review' | 'forwarding'; title: string; why: string; action: string; asset_key?: string; receipt_id?: string; confidence?: number };
export type HubData = { inbox: InboxItem[]; stats: { assets: number; verified: number; verified_pct: number; receipts: number; auto_linked: number; confirmed_links: number; evidence_mb: number }; assets: HubAsset[] };

const TABS: Array<{ id: HubTab; label: string; Icon: typeof Inbox }> = [
  { id: 'overview', label: 'סקירה', Icon: LayoutGrid }, { id: 'media', label: 'מדיה', Icon: Images }, { id: 'receipts', label: 'קבלות ומנויים', Icon: Receipt },
  { id: 'consent', label: 'הסכמות משתמשים', Icon: UserCheck }, { id: 'evidence', label: 'תיקי ראיות', Icon: FileArchive }, { id: 'keys', label: 'גיבוי מפתחות', Icon: KeyRound },
];
const KIND_HE: Record<string, string> = { audio: 'שיר', image: 'תמונה', illustration: 'איור', icon: 'אייקון', video: 'סרטון', font: 'גופן', file: 'קובץ' };
export const kindHe = (k: string) => KIND_HE[k] ?? 'קובץ';
const DOT: Record<InboxItem['kind'], string> = { match: 'bg-amber-500/15 text-amber-700', missing_receipt: 'bg-rose-500/10 text-rose-700', missing_source: 'bg-rose-500/10 text-rose-700', receipt_review: 'bg-teal-500/15 text-teal-700', forwarding: 'bg-teal-500/15 text-teal-700' };

export function statusChip(a: HubAsset) {
  if (a.status === 'missing_source') return { label: 'חסר מקור', cls: 'border-rose-300/60 bg-rose-500/10 text-rose-800' };
  if (a.receipt === 'suggested') return { label: 'ממתין לאישור קבלה', cls: 'border-amber-300/70 bg-amber-500/15 text-amber-800' };
  if (a.receipt === 'missing') return { label: 'חסרה קבלה', cls: 'border-rose-300/60 bg-rose-500/10 text-rose-800' };
  if (a.status === 'draft') return { label: 'חסרים פרטים', cls: 'border-amber-300/70 bg-amber-500/15 text-amber-800' };
  return { label: 'מתועד', cls: 'border-emerald-300/60 bg-emerald-500/10 text-emerald-800' };
}

export function LegalHub({ initialTab = 'overview' }: { initialTab?: HubTab }) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [data, setData] = useState<HubData | null>(null);
  const [err, setErr] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [asset, setAsset] = useState<string | null>(null);
  const load = useCallback(() => { fetch('/api/v1/ops/legal/hub', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setData(d); setErr(false); }).catch(() => setErr(true)); }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, 30_000);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const a = sp.get('asset'); if (a) { setAsset(a); setTab('media'); }
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const go = (t: HubTab, extra?: Record<string, string | null>) => {
    setTab(t);
    const u = new URL(window.location.href); u.searchParams.set('tab', t);
    for (const [k, v] of Object.entries(extra ?? {})) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
    window.history.replaceState(null, '', u);
  };
  const openAsset = (k: string) => { setAsset(k); go('media', { asset: k }); };
  const closeAsset = () => { setAsset(null); const u = new URL(window.location.href); u.searchParams.delete('asset'); window.history.replaceState(null, '', u); };
  const actionCount = data?.inbox.length ?? 0;

  return (
    <div dir="rtl" className="space-y-4 sm:space-y-5" data-testid="legal-hub">
      <button type="button" onClick={() => setSearchOpen(true)} className="group flex w-full items-center gap-3 rounded-[22px] border border-gc/50 bg-background-card/55 px-4 py-3.5 text-right shadow-[0_14px_40px_rgba(6,60,50,0.10)] backdrop-blur-2xl transition hover:bg-background-card/75" data-testid="hub-search-open">
        <Search size={18} className="shrink-0 text-teal-700" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-slate-500">חיפוש בכל מקום: שיר, קבלה, ספק, משתמש, ״השיר מהקיץ על הריצה״</span>
        <kbd className="hidden rounded-lg border border-teal-700/20 px-2 py-0.5 text-[11px] font-bold text-teal-800 sm:inline">⌘K</kbd>
      </button>

      <nav role="tablist" aria-label="מרכז זכויות וראיות" className="-mx-1 flex gap-1 overflow-x-auto rounded-[22px] border border-gc/50 bg-background-card/45 p-1 backdrop-blur-2xl [scrollbar-width:none]">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => go(id, { asset: null })} data-testid={`hub-tab-${id}`}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[13.5px] font-bold transition sm:flex-1 sm:justify-center', tab === id ? 'bg-linear-to-br from-teal-700 to-emerald-700 text-amber-50 shadow-[0_8px_20px_rgba(4,120,87,0.28)]' : 'text-slate-600 hover:bg-glass/50 hover:text-slate-900')}>
            <Icon size={15} />{label}
            {id === 'overview' && actionCount ? <span className={cn('grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]', tab === id ? 'bg-amber-300 text-emerald-950' : 'bg-amber-500 text-emerald-950')}>{actionCount}</span> : null}
          </button>
        ))}
      </nav>

      {err && !data ? <p role="alert" className="rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800">לא הצלחנו לטעון. מנסים שוב לבד.</p> : null}

      <div role="tabpanel">
        {tab === 'overview' ? <Overview data={data} onOpenAsset={openAsset} onGo={go} onChanged={load} />
          : tab === 'media' ? <MediaGrid data={data} onOpen={openAsset} />
          : tab === 'receipts' ? <ReceiptsSection onChanged={load} />
          : tab === 'consent' ? <AdminLegalPanel />
          : tab === 'evidence' ? <div className="space-y-4"><EvidenceIntro /><AdminLegalPasswords /><AdminLegalGuide /></div>
          : <div className="space-y-4"><AdminKeyBackup /><AdminKmsWrap /><StepUpSettings /></div>}
      </div>

      {asset ? <AssetSheet assetKey={asset} hub={data?.assets.find((a) => a.key === asset) ?? null} onClose={closeAsset} onChanged={load} /> : null}
      <HubSearch open={searchOpen} onClose={() => setSearchOpen(false)} onPick={(h) => {
        setSearchOpen(false);
        if (h.type === 'media') openAsset(h.id);
        else if (h.type === 'receipt') go('receipts', { receipt: h.id });
        else if (h.type === 'consent') { go('consent', { user: h.id }); }
        else window.location.href = h.href;
      }} />
    </div>
  );
}

function Overview({ data, onOpenAsset, onGo, onChanged }: { data: HubData | null; onOpenAsset: (k: string) => void; onGo: (t: HubTab, e?: Record<string, string | null>) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return <div className={cn(opsGlassCardClass, 'grid place-items-center p-12')}><Loader2 className="animate-spin text-slate-400" /></div>;
  const s = data.stats;
  const act = async (it: InboxItem) => {
    if (it.kind === 'match' && it.asset_key) return onOpenAsset(it.asset_key);
    if (it.kind === 'missing_source' && it.asset_key) return onOpenAsset(it.asset_key);
    if (it.kind === 'missing_receipt' && it.asset_key) return onOpenAsset(it.asset_key);
    if (it.receipt_id) return onGo('receipts', { receipt: it.receipt_id });
    setBusy(null); onChanged();
  };
  const shown = data.inbox.slice(0, 6);
  return (
    <div className="grid gap-4 lg:grid-cols-12" data-testid="hub-overview">
      <section className={cn(opsGlassCardClass, 'p-5 lg:col-span-8')} aria-label="מה מחכה לך">
        <p className="text-[12px] font-bold tracking-wide text-amber-700">מה מחכה לך</p>
        {data.inbox.length ? (
          <>
            <h2 className="mt-0.5 font-[Rubik] text-xl font-bold text-slate-900 sm:text-2xl">{data.inbox.length === 1 ? 'דבר אחד צריך אותך' : `${data.inbox.length} דברים צריכים אותך`}</h2>
            <p className="mt-1 text-[13px] text-slate-600">כל השאר טופל לבד: {s.auto_linked + s.confirmed_links} קבלות שויכו, {s.verified} קבצים מתועדים.</p>
            <ul className="mt-3 space-y-2.5">
              {shown.map((it) => (
                <li key={it.id} className="flex flex-wrap items-start gap-3 rounded-[20px] border border-gc/40 bg-glass/30 p-3.5 backdrop-blur-md sm:flex-nowrap" data-testid="hub-inbox-item">
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', DOT[it.kind])}>{it.kind === 'match' ? <Sparkles size={17} /> : it.kind.startsWith('receipt') || it.kind === 'missing_receipt' ? <Receipt size={17} /> : it.kind === 'forwarding' ? <Inbox size={17} /> : <Images size={17} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-[Rubik] text-[14.5px] font-bold leading-snug text-slate-900">{it.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{it.why}</p>
                  </div>
                  <button type="button" disabled={busy === it.id} onClick={() => void act(it)} className={cn('mr-12 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-3.5 text-[13px] font-bold sm:mr-0', it.kind === 'match' ? 'bg-linear-to-br from-amber-500 to-amber-700 text-amber-50 shadow-[0_6px_16px_rgba(180,83,9,0.28)]' : 'border border-teal-700/25 bg-teal-600/10 text-teal-800')}>
                    {it.action}<ChevronLeft size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {data.inbox.length > shown.length ? <p className="mt-2 text-center text-[12px] text-slate-500">ועוד {data.inbox.length - shown.length}. מטפלים באלה קודם, והשאר יעלו לבד.</p> : null}
          </>
        ) : (
          <div className="grid place-items-center gap-2 py-8 text-center">
            <CheckCircle2 size={40} className="text-emerald-600" />
            <h2 className="font-[Rubik] text-xl font-bold text-slate-900">אין כרגע שום דבר שצריך אותך</h2>
            <p className="text-sm text-slate-600">קבלות, מקורות וחותמות זמן מטופלים לבד. אם משהו יחסר, הוא יופיע כאן.</p>
          </div>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1 lg:gap-4">
        <Stat className="col-span-2 lg:col-span-1" eyebrow="מצב כללי" value={`${s.verified_pct}%`} sub="מהקבצים באתר מתועדים במלואם" tone="teal" bar={s.verified_pct} />
        <Stat eyebrow="קבלות" value={String(s.receipts)} sub={`${s.auto_linked + s.confirmed_links} שויכו לקבצים`} tone="amber" />
        <Stat eyebrow="אחסון ראיות" value={`${s.evidence_mb}MB`} sub="רחוק מאוד מהמגבלה" tone="emerald" />
      </div>
      <section className={cn(opsGlassCardClass, 'p-5 lg:col-span-12')} aria-label="פעילות אחרונה">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[12px] font-bold tracking-wide text-amber-700">פעילות אחרונה</p><h3 className="font-[Rubik] font-bold text-slate-900">מדיה שנוספה או השתנתה</h3></div>
          <button type="button" onClick={() => onGo('media')} className={cn(opsGlassBtnClass, 'gap-1 text-[13px]')}>לכל המדיה<ArrowLeft size={14} /></button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.assets.slice(0, 6).map((a) => <AssetTile key={a.key} a={a} onOpen={onOpenAsset} />)}
        </div>
      </section>
    </div>
  );
}

function Stat({ eyebrow, value, sub, tone, bar, className }: { eyebrow: string; value: string; sub: string; tone: 'teal' | 'amber' | 'emerald'; bar?: number; className?: string }) {
  const glow = tone === 'teal' ? 'bg-teal-400/35' : tone === 'amber' ? 'bg-amber-400/35' : 'bg-emerald-500/30';
  const col = tone === 'teal' ? 'text-teal-800' : tone === 'amber' ? 'text-amber-800' : 'text-emerald-800';
  return (
    <div className={cn(opsGlassCardClass, 'relative overflow-hidden p-4 sm:p-5', className)}>
      <span aria-hidden className={cn('pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full blur-xl', glow)} />
      <p className="text-[12px] font-bold tracking-wide text-amber-700">{eyebrow}</p>
      <p className={cn('mt-0.5 font-[Rubik] text-3xl font-extrabold leading-none sm:text-4xl', col)}>{value}</p>
      <p className="mt-1 text-[12.5px] text-slate-600">{sub}</p>
      {bar !== undefined ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-teal-900/10"><div className="h-full rounded-full bg-linear-to-l from-teal-500 to-emerald-700" style={{ width: `${bar}%` }} /></div> : null}
    </div>
  );
}

export function AssetTile({ a, onOpen }: { a: HubAsset; onOpen: (k: string) => void }) {
  const st = statusChip(a);
  return (
    <button type="button" onClick={() => onOpen(a.key)} className="group overflow-hidden rounded-[20px] border border-gc/40 bg-glass/30 text-right shadow-[0_8px_24px_rgba(6,60,50,0.08)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(6,60,50,0.14)]" data-testid="hub-asset-tile">
      <AssetThumb thumb={a.thumb} kind={a.kind} className="aspect-[4/3] w-full" />
      <div className="p-2.5">
        <p className="truncate font-[Rubik] text-[13.5px] font-bold text-slate-900">{a.title || a.key.split('/').pop()}</p>
        <p className="text-[11px] text-slate-500">{kindHe(a.kind)}{a.created_on ? ` · ${a.created_on.split('-').reverse().join('.')}` : ''}</p>
        <span className={cn('mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-bold', st.cls)}>{st.label}</span>
      </div>
    </button>
  );
}

const FILTERS: Array<{ id: string; label: string; test: (a: HubAsset) => boolean }> = [
  { id: 'all', label: 'הכול', test: () => true },
  { id: 'action', label: 'צריך אותך', test: (a) => statusChip(a).label !== 'מתועד' },
  { id: 'audio', label: 'שירים', test: (a) => a.kind === 'audio' },
  { id: 'image', label: 'תמונות ואיורים', test: (a) => a.kind === 'image' || a.kind === 'illustration' },
  { id: 'video', label: 'סרטונים', test: (a) => a.kind === 'video' },
  { id: 'other', label: 'גופנים ואייקונים', test: (a) => a.kind === 'font' || a.kind === 'icon' },
];

function MediaGrid({ data, onOpen }: { data: HubData | null; onOpen: (k: string) => void }) {
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const words = expand(normalize(q).split(' ').filter(Boolean));
    const base = (data?.assets ?? []).filter(FILTERS.find((x) => x.id === f)!.test);
    if (!words.length) return base;
    return base.map((a) => ({ a, s: fuzzyScore(`${a.title ?? ''} ${a.key} ${kindHe(a.kind)} ${a.kind} ${a.source_type} ${a.match?.vendor ?? ''}`, words) })).filter((x) => x.s > 0.3).sort((x, y) => y.s - x.s).map((x) => x.a);
  }, [data, f, q]);
  const groups = useMemo(() => {
    const out = new Map<string, HubAsset[]>();
    for (const a of list) { const g = f === 'all' && !q ? kindHe(a.kind) : ''; out.set(g, [...(out.get(g) ?? []), a]); }
    return [...out];
  }, [list, f, q]);
  if (!data) return <div className={cn(opsGlassCardClass, 'grid place-items-center p-12')}><Loader2 className="animate-spin text-slate-400" /></div>;
  return (
    <div className="space-y-4" data-testid="hub-media">
      <div className="sticky top-2 z-10 space-y-2 rounded-[22px] border border-gc/50 bg-background-card/75 p-2.5 shadow-[0_12px_36px_rgba(6,60,50,0.10)] backdrop-blur-2xl">
        <label className="relative block">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="סינון מהיר בתוך המדיה" className="w-full rounded-2xl border border-gc/50 bg-glass/50 py-2.5 pr-9 pl-9 text-sm outline-none focus:ring-2 focus:ring-teal-300" />
          {q ? <button type="button" onClick={() => setQ('')} aria-label="ניקוי" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400"><X size={14} /></button> : null}
        </label>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {FILTERS.map((x) => { const n = data.assets.filter(x.test).length; return n || x.id === 'all' ? (
            <button key={x.id} type="button" onClick={() => setF(x.id)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition', f === x.id ? 'border-teal-600/60 bg-teal-700 text-amber-50' : 'border-gc/50 bg-glass/40 text-slate-700 hover:bg-glass/70')}>{x.label} · {n}</button>
          ) : null; })}
        </div>
      </div>
      {list.length === 0 ? <p className={cn(opsGlassCardClass, 'p-8 text-center text-sm text-slate-500')}>לא נמצא. אפשר לנסות מילה אחרת או את החיפוש הגדול למעלה.</p> : groups.map(([g, items]) => (
        <section key={g || 'all'} className="space-y-2">
          {g ? <h3 className="px-1 font-[Rubik] text-sm font-bold text-teal-800">{g} · {items.length}</h3> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{items.map((a) => <AssetTile key={a.key} a={a} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

function EvidenceIntro() {
  return (
    <section className={cn(opsGlassCardClass, 'relative overflow-hidden p-5')}>
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-teal-400/25 blur-3xl" />
      <p className="text-[12px] font-bold tracking-wide text-amber-700">תיקי ראיות</p>
      <h2 className="font-[Rubik] text-lg font-bold text-slate-900">קובץ אחד שנפתח בכל דפדפן ובודק את עצמו</h2>
      <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-slate-600">כל תיק שמפיקים כולל את <b>תיק-ראיות.html</b>: פותחים אותו בלחיצה כפולה, גם בלי אינטרנט, ורואים סיכום, ציר זמן, צילומים וקבלות. הדפדפן מאמת לבד את טביעות האצבע והחתימות ומציג ״תקין״ או ״לא תקין״ ליד כל פריט. ה־PDF נשאר בתיק כרגיל. מפיקים תיק מתוך המשתמש (הסכמות) או מתוך הקובץ (מדיה).</p>
    </section>
  );
}
