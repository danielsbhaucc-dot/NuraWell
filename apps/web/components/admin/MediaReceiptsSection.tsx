'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Mail, Paperclip, ShieldCheck, ShieldAlert } from 'lucide-react';
import { opsGlassBtnClass, opsGlassBtnPrimaryClass, opsGlassCardClass, opsInputClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { VENDORS, type VendorId } from '@/lib/legal/media/receipts-core';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';

type Receipt = { id: string; source: string; vendor: VendorId; plan: string | null; amount: number | null; currency: string | null; receipt_date: string | null; period_start: string | null; period_end: string | null; subject: string | null; original_from: string | null; forwarder_ok: boolean; dkim: { vendor_dkim_pass?: boolean }; trust: 'verified' | 'review' | 'rejected'; attachments: Array<{ name: string }>; confirmation_code: string | null; confirmation_link?: string | null; confirmed_at?: string | null; created_at: string };
const TRUST = { verified: { l: 'מאומת (DKIM של הספק)', c: 'border-teal-300/70 bg-teal-500/10 text-teal-800' }, review: { l: 'לבדיקה', c: 'border-orange-300/70 bg-orange-500/10 text-orange-800' }, rejected: { l: 'נדחה', c: 'border-rose-300/70 bg-rose-500/10 text-rose-800' } } as const;

function Row({ r, onSaved }: { r: Receipt; onSaved: () => void }) {
  const [p, setP] = useState({ vendor: r.vendor, plan: r.plan ?? '', period_start: r.period_start ?? '', period_end: r.period_end ?? '' });
  const [busy, setBusy] = useState<null | 'save' | 'confirm' | Receipt['trust']>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = p.vendor !== r.vendor || p.plan !== (r.plan ?? '') || p.period_start !== (r.period_start ?? '') || p.period_end !== (r.period_end ?? '');
  const save = async (trust?: Receipt['trust']) => {
    if (p.period_start && p.period_end && p.period_end < p.period_start) { setMsg({ ok: false, text: 'סוף התקופה לפני תחילתה. כדאי לתקן את התאריכים.' }); return; }
    setBusy(trust ?? 'save'); setMsg(null);
    try {
      const res = await fetch('/api/v1/ops/legal/receipts/item', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, vendor: p.vendor, plan: p.plan.trim() || null, period_start: p.period_start || null, period_end: p.period_end || null, ...(trust ? { trust } : {}) }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        const text = res.status === 401 || res.status === 403 || res.status === 404 ? 'נראה שהחיבור למערכת פג. כדאי לרענן את הדף ולהתחבר שוב.' : res.status === 400 ? 'אחד השדות לא תקין (למשל תאריך או מסלול ארוך מדי). כדאי לבדוק ולנסות שוב.' : 'השמירה לא הצליחה בצד השרת. כדאי לנסות שוב בעוד רגע.';
        setMsg({ ok: false, text }); return;
      }
      setMsg({ ok: true, text: trust === 'verified' ? 'הקבלה אושרה ונרשמה ביומן הראיות עם חותמת זמן' : trust === 'rejected' ? 'הקבלה סומנה כלא רלוונטית' : 'השינויים נשמרו ונרשמו ביומן הראיות עם חותמת זמן' });
      onSaved();
    } catch { setMsg({ ok: false, text: 'אין חיבור לשרת. כדאי לבדוק את האינטרנט ולנסות שוב.' }); } finally { setBusy(null); }
  };
  if (r.source === 'gmail_confirmation') {
    if (r.confirmed_at) return (
      <li className="flex items-center gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-900">
        <CheckCircle2 size={14} className="text-emerald-700" />ההעברה האוטומטית מ־Gmail אושרה ופועלת
      </li>
    );
    const safeLink = r.confirmation_link && /^https:\/\/([\w-]+\.)*google\.com\//.test(r.confirmation_link) ? r.confirmation_link : null;
    return (
      <li className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-950">
        <p className="font-bold">Gmail מבקש לאשר העברה אוטומטית לכתובת הקבלות</p>
        {r.confirmation_code ? <p className="mt-1">קוד האישור: <span className="font-mono text-base font-black" dir="ltr">{r.confirmation_code}</span></p> : null}
        {!r.confirmation_code && !safeLink ? <p className="mt-1 text-xs">אפשר לאשר מתוך הגדרות ההעברה ב־Gmail.</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full border border-amber-300 bg-amber-100/80 px-3 py-1 text-xs font-bold text-amber-950 underline-offset-2 hover:underline">לאישור בלחיצה אחת ב־Gmail</a> : null}
          <button type="button" disabled={!!busy} onClick={async () => { setBusy('confirm'); await fetch('/api/v1/ops/legal/receipts/item', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, confirmed: true }) }).catch(() => undefined); setBusy(null); onSaved(); }} className="inline-flex rounded-full border border-emerald-300/70 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-900">כבר אישרתי</button>
        </div>
        <p className="mt-2 text-[11px] text-amber-900/80">ברגע שתגיע לכאן קבלה ראשונה דרך ההעברה, ההודעה תסומן כמאושרת לבד.</p>
      </li>
    );
  }
  return (
    <li className="rounded-2xl border border-gc/50 bg-glass/55 backdrop-blur-md p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-slate-900">{VENDORS[r.vendor]?.label ?? r.vendor}</span>
        {r.plan ? <span className="text-slate-600">· {r.plan}</span> : null}
        {r.amount !== null ? <span className="text-slate-600" dir="ltr">· {r.amount} {r.currency ?? ''}</span> : null}
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-bold', TRUST[r.trust].c)}>{r.trust === 'verified' ? <ShieldCheck size={11} className="inline" /> : <ShieldAlert size={11} className="inline" />} {TRUST[r.trust].l}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">{r.subject} · {r.source === 'email' ? 'הגיע במייל' : 'הועלה ידנית'}{r.attachments.length ? ` · ${r.attachments.length} קבצים` : ''}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <select value={p.vendor} onChange={(e) => setP({ ...p, vendor: e.target.value as VendorId })} className={cn(opsInputClass, 'py-1.5 text-xs')} aria-label="ספק">{Object.entries(VENDORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <input value={p.plan} onChange={(e) => setP({ ...p, plan: e.target.value })} placeholder="מסלול" className={cn(opsInputClass, 'py-1.5 text-xs')} aria-label="מסלול" />
        <input type="date" value={p.period_start} onChange={(e) => setP({ ...p, period_start: e.target.value })} className={cn(opsInputClass, 'py-1.5 text-xs')} aria-label="תחילת תקופה" />
        <input type="date" value={p.period_end} onChange={(e) => setP({ ...p, period_end: e.target.value })} className={cn(opsInputClass, 'py-1.5 text-xs')} aria-label="סוף תקופה" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!busy || !dirty} onClick={() => save()} className={cn(opsGlassBtnClass, !dirty && 'opacity-50')} title={dirty ? undefined : 'אין שינויים לשמירה'}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null}שמירת השינויים</button>
        {r.trust !== 'verified' ? <button type="button" disabled={!!busy} onClick={() => save('verified')} className={opsGlassBtnPrimaryClass}>{busy === 'verified' ? <Loader2 size={14} className="animate-spin" /> : null}אישור הקבלה</button> : null}
        {r.trust !== 'rejected' ? <button type="button" disabled={!!busy} onClick={() => save('rejected')} className={opsGlassBtnClass}>{busy === 'rejected' ? <Loader2 size={14} className="animate-spin" /> : null}לא רלוונטי</button> : null}
        {msg ? <span role="status" aria-live="polite" className={cn('text-xs font-bold', msg.ok ? 'text-teal-800' : 'text-rose-700')}>{msg.text}</span> : !dirty && !busy ? <span className="text-[11px] text-slate-500">כדי לשמור, קודם משנים ספק, מסלול או תאריכים</span> : null}
      </div>
    </li>
  );
}

export function ReceiptsSection({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ receipts: Receipt[]; address: string; configured: boolean } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState<VendorId>('suno');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback((live = false) => { fetch(`/api/v1/ops/legal/receipts${live ? '?live=1' : ''}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  const liveLoad = useCallback(() => load(true), [load]);
  useLiveRefresh(liveLoad, open ? 10_000 : 45_000);
  const upload = async () => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/v1/ops/legal/receipts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, mime: file.type || (file.name.endsWith('.eml') ? 'message/rfc822' : 'application/pdf'), data_b64: b64, vendor, receipt_date: date || null }) });
      if (!r.ok) throw new Error();
      setFile(null); setMsg('הקבלה נשמרה, נחתמה וקיבלה חותמת זמן'); load(); onChanged();
    } catch { setMsg('ההעלאה נכשלה'); } finally { setBusy(false); }
  };
  const [imp, setImp] = useState<string | null>(null);
  const importZip = async (f: File | undefined) => {
    if (!f) return;
    setImp('מייבא ומחתים...');
    try {
      const r = await fetch('/api/v1/ops/legal/media/import', { method: 'POST', headers: { 'content-type': 'application/zip' }, body: f });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setImp(`יובאו ${j.receipts_new} קבלות, ${j.attachments} מסמכים ו־${j.provenance} עדכוני מקור (${j.files.length} קבצים, כולם נחתמו)`); load(); onChanged();
    } catch (e) { setImp(`הייבוא נכשל${e instanceof Error && e.message ? `: ${e.message}` : ''}`); }
  };
  const pending = (data?.receipts ?? []).filter((r) => r.trust === 'review' && r.source !== 'gmail_confirmation').length;
  return (
    <section id="receipts" className={cn(opsGlassCardClass, 'p-4')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between text-right">
        <span className="flex items-center gap-2 font-bold text-slate-900"><Mail size={16} className="text-teal-700" />קבלות ומנויים{pending ? <span className="rounded-full bg-orange-100 px-2 text-xs text-orange-800">{pending} לבדיקה</span> : null}</span>
        <ChevronDown size={16} className={cn('text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open ? !data ? <Loader2 className="mx-auto my-4 animate-spin text-slate-400" /> : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">קבלות שמגיעות לכתובת <span className="font-bold" dir="ltr">{data.address}</span> נשמרות כאן אוטומטית, עם המייל המקורי, בדיקת חתימת הספק וחותמת זמן. כך כל תמונה ושיר מ־AI מראים אם נוצרו בזמן מנוי בתשלום.</p>
          {!data.configured ? <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800">קליטת המיילים עוד לא הופעלה. בינתיים אפשר להעלות קבלה ידנית.</p> : null}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-gc/70 p-3">
            <select value={vendor} onChange={(e) => setVendor(e.target.value as VendorId)} className={cn(opsInputClass, 'w-40 py-1.5 text-xs')} aria-label="ספק">{Object.entries(VENDORS).filter(([k]) => k !== 'unknown').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(opsInputClass, 'w-40 py-1.5 text-xs')} aria-label="תאריך הקבלה" />
            <label className={cn(opsGlassBtnClass, 'cursor-pointer')}><Paperclip size={14} />{file ? file.name.slice(0, 22) : 'PDF, תמונה או ‎.eml'}
              <input type="file" accept="application/pdf,image/png,image/jpeg,.eml,message/rfc822" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" onClick={upload} disabled={!file || busy} className={opsGlassBtnPrimaryClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}העלאה</button>
            {msg ? <span role="status" className="text-xs font-bold text-slate-700">{msg}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn(opsGlassBtnClass, 'cursor-pointer')}><Paperclip size={14} />ייבוא תיק ראיות (ZIP)
              <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => void importZip(e.target.files?.[0])} />
            </label>
            {imp ? <span role="status" className="text-xs font-bold text-slate-700">{imp}</span> : null}
          </div>
          {data.receipts.length ? <ul className="space-y-2">{data.receipts.map((r) => <Row key={r.id} r={r} onSaved={() => { load(); onChanged(); }} />)}</ul> : <p className="text-center text-xs text-slate-500">עוד אין קבלות.</p>}
        </div>
      ) : null}
    </section>
  );
}
