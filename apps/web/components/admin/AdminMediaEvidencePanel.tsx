'use client';

import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileText, Film, Image as ImageIcon, Loader2, Music, Paperclip, RefreshCw, Search, ShieldAlert, ShieldCheck, Type as FontIcon, Shapes, X } from 'lucide-react';
import { OpsDivider, opsGlassBtnClass, opsGlassBtnPrimaryClass, opsGlassCardClass, opsInputClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { ReceiptsSection } from './MediaReceiptsSection';
import { FIELD_LABEL_HE, GENERATORS, SOURCE_LABEL_HE, SOURCE_TYPES, type Provenance, type SourceType } from '@/lib/legal/media/labels';

type Commit = { sha: string; author: string; date: string; subject: string } | null;
type Item = {
  key: string; origin: string; kind: string; path: string | null; title: string | null; mime: string | null; bytes: number | null; width: number | null; height: number | null;
  sha256: string | null; phash: string | null; source_type: SourceType; status: 'verified' | 'draft' | 'missing_source'; provenance: Provenance; usages: string[]; missing: string[];
  first_commit: Commit; last_commit: Commit; ai_description: string | null; ai_tags: string[]; records: number; present: boolean; public_url: string | null; has_file: boolean; updated_at: string;
  metadata: { c2pa: boolean; c2pa_claim_generator: string | null; software: string | null; ai_likely_source: string | null; digital_source_type: string | null; id3: Record<string, string> | null };
  search: string;
  coverage?: { vendor: string; plan: string | null; period_start: string | null; period_end: string | null; trust: string } | null;
};
type Rec = { id: string; event: string; created_at: string; record_hash: string; tsa: boolean; ots: boolean; summary: Record<string, unknown> };
type Verify = { ok: boolean; chain_ok: boolean; file_ok: boolean | null; checks: Array<{ id: string; problems: string[]; tsa_ok: boolean }>; checked_at: string };

const fmt = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—');
const STATUS: Record<Item['status'], { label: string; cls: string }> = {
  missing_source: { label: 'חסר מקור', cls: 'border-rose-300/70 bg-rose-500/10 text-rose-800' },
  draft: { label: 'חסרים פרטים', cls: 'border-orange-300/70 bg-orange-500/10 text-orange-800' },
  verified: { label: 'מתועד', cls: 'border-teal-300/70 bg-teal-500/10 text-teal-800' },
};
const KIND: Record<string, { label: string; Icon: typeof ImageIcon }> = {
  image: { label: 'תמונה', Icon: ImageIcon }, illustration: { label: 'איור', Icon: Shapes }, icon: { label: 'אייקון', Icon: Shapes },
  audio: { label: 'שמע', Icon: Music }, video: { label: 'וידאו', Icon: Film }, font: { label: 'גופן', Icon: FontIcon }, file: { label: 'קובץ', Icon: FileText },
};
const EVENT: Record<string, string> = { scan: 'סריקה ותיעוד', provenance: 'עדכון מקור', license_snapshot: 'שמירת עמוד', attachment: 'מסמך מצורף', ai_describe: 'תיאור' };
const FIELDS_BY_TYPE: Record<SourceType, Array<keyof Provenance>> = {
  in_house: ['notes'],
  stock_cc0: ['source_url', 'author', 'license_name', 'license_url', 'notes'],
  stock_license: ['source_url', 'author', 'author_url', 'license_name', 'license_url', 'notes'],
  ai_image: ['generator', 'model', 'prompt', 'created_on', 'account', 'plan', 'source_url', 'license_status', 'notes'],
  ai_music: ['generator', 'model', 'prompt', 'track_id', 'track_url', 'created_on', 'account', 'plan', 'license_status', 'notes'],
  ai_voice: ['generator', 'model', 'created_on', 'account', 'plan', 'notes'],
  font_license: ['source_url', 'author', 'license_name', 'license_url'],
  library_license: ['source_url', 'license_name', 'license_url'],
  owner_upload: ['notes', 'source_url', 'created_on'],
  unknown: ['notes'],
};
const EXTRA_LABEL: Partial<Record<keyof Provenance, string>> = { author_url: 'קישור ליוצר', model: 'מודל', account: 'חשבון (בלי סיסמה)', track_id: 'מזהה שיר', tos_url: 'תנאי שימוש' };
const label = (k: keyof Provenance) => FIELD_LABEL_HE[k] ?? EXTRA_LABEL[k] ?? k;

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold', className)}>{children}</span>;
}

function thumbSrc(i: Item) {
  if (!i.mime?.startsWith('image/')) return null;
  if (i.origin === 'repo' && i.public_url) return i.public_url;
  return i.has_file ? `/api/v1/ops/legal/media/item/file?key=${encodeURIComponent(i.key)}` : null;
}

async function download(url: string, fallback: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  const blob = await r.blob();
  const name = decodeURIComponent(r.headers.get('x-export-file') ?? '') || /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] || fallback;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { name, sha: r.headers.get('x-export-sha256') };
}

function ProvenanceForm({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [p, setP] = useState<Provenance>({ ...item.provenance, source_type: item.source_type });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = (p.source_type ?? 'unknown') as SourceType;
  const save = async () => {
    setBusy(true); setMsg(null);
    const body: Record<string, unknown> = { source_type: t };
    for (const k of FIELDS_BY_TYPE[t]) body[k] = (p[k] as string | null | undefined) ?? null;
    try {
      const r = await fetch('/api/v1/ops/legal/media/item/provenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: item.key, provenance: body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(String(r.status));
      setMsg({ ok: true, text: j.missing?.length ? `נשמר ונחתם. עוד חסר: ${j.missing.map((m: keyof Provenance) => label(m)).join(', ')}` : 'נשמר, נחתם וקיבל חותמת זמן' });
      onSaved();
    } catch { setMsg({ ok: false, text: 'השמירה נכשלה. כדאי לבדוק שהקישורים מלאים (https://...)' }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">סוג המקור
        <select value={t} onChange={(e) => setP({ ...p, source_type: e.target.value as SourceType })} className={cn(opsInputClass, 'mt-1')}>
          {SOURCE_TYPES.map((s) => <option key={s} value={s}>{SOURCE_LABEL_HE[s]}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS_BY_TYPE[t].map((k) => {
          const v = (p[k] as string | null | undefined) ?? '';
          const required = item.missing.includes(k);
          if (k === 'generator') return (
            <label key={k} className="block text-xs font-bold text-slate-600">{label(k)}{required ? <span className="text-rose-600"> *</span> : null}
              <select value={v} onChange={(e) => setP({ ...p, generator: (e.target.value || null) as Provenance['generator'] })} className={cn(opsInputClass, 'mt-1')}>
                <option value="">בחירה</option>
                {Object.entries(GENERATORS).map(([id, g]) => <option key={id} value={id}>{g.label}</option>)}
              </select>
            </label>
          );
          if (k === 'license_status') return (
            <label key={k} className="block text-xs font-bold text-slate-600">מצב הרישיון
              <select value={v} onChange={(e) => setP({ ...p, license_status: (e.target.value || null) as Provenance['license_status'] })} className={cn(opsInputClass, 'mt-1')}>
                <option value="">לא צוין</option><option value="pending">ממתין להוכחה</option><option value="confirmed">מאושר</option>
              </select>
            </label>
          );
          if (k === 'prompt' || k === 'notes') return (
            <label key={k} className="block text-xs font-bold text-slate-600 sm:col-span-2">{label(k)}{required ? <span className="text-rose-600"> *</span> : null}
              <textarea value={v} onChange={(e) => setP({ ...p, [k]: e.target.value })} rows={k === 'prompt' ? 4 : 2} className={cn(opsInputClass, 'mt-1 resize-y')} dir="auto" />
            </label>
          );
          const isUrl = /url$/.test(k);
          return (
            <label key={k} className="block text-xs font-bold text-slate-600">{label(k)}{required ? <span className="text-rose-600"> *</span> : null}
              <input value={v} onChange={(e) => setP({ ...p, [k]: e.target.value })} type={k === 'created_on' ? 'date' : 'text'} inputMode={isUrl ? 'url' : undefined} dir={isUrl ? 'ltr' : 'auto'} placeholder={isUrl ? 'https://' : undefined} className={cn(opsInputClass, 'mt-1')} />
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className={opsGlassBtnPrimaryClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}שמירה ותיעוד</button>
        {msg ? <span role="status" className={cn('text-xs font-bold', msg.ok ? 'text-teal-800' : 'text-rose-700')}>{msg.text}</span> : null}
      </div>
    </div>
  );
}

function AttachmentBox({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [lbl, setLbl] = useState('קבלה / חשבונית');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    if (!file) return;
    if (file.size > 8_000_000) { setMsg('הקובץ גדול מ־8MB'); return; }
    setBusy(true); setMsg(null);
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/v1/ops/legal/media/item/attachment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: item.key, name: file.name, mime: file.type || 'application/pdf', label: lbl, data_b64: b64 }) });
      if (!r.ok) throw new Error();
      setFile(null); setMsg('צורף, נחתם וקיבל חותמת זמן'); onSaved();
    } catch { setMsg('הצירוף נכשל (PDF, תמונה או טקסט בלבד)'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {(item.provenance.attachments ?? []).length ? (
        <ul className="space-y-1 text-xs text-slate-700">{item.provenance.attachments!.map((a) => <li key={a.sha256} className="flex items-center gap-1.5"><Paperclip size={12} />{a.label} · {a.name}</li>)}</ul>
      ) : <p className="text-xs text-slate-500">אין עדיין מסמכים מצורפים.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input value={lbl} onChange={(e) => setLbl(e.target.value)} className={cn(opsInputClass, 'w-44 py-1.5 text-xs')} aria-label="תיאור המסמך" />
        <label className={cn(opsGlassBtnClass, 'cursor-pointer')}><Paperclip size={14} />{file ? file.name.slice(0, 24) : 'בחירת קובץ'}
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/html,message/rfc822" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" onClick={send} disabled={!file || busy} className={opsGlassBtnPrimaryClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}צירוף</button>
        {msg ? <span role="status" className="text-xs font-bold text-slate-700">{msg}</span> : null}
      </div>
    </div>
  );
}

function PendingLicenseCard({ p, onDone }: { p: { key: string; title: string; action: string; kind?: string }; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8_000_000) { setMsg('הקובץ גדול מ־8MB'); return; }
    setBusy(true); setMsg(null);
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/v1/ops/legal/media/item/attachment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: p.key, name: file.name, mime: file.type || 'application/pdf', label: 'קבלת רכישה (רישיון מסחרי)', data_b64: b64, resolves_license: true }) });
      if (!r.ok) throw new Error();
      setMsg('נשמר, נחתם וקיבל חותמת זמן. הרישיון סומן כמאושר'); onDone();
    } catch { setMsg('ההעלאה נכשלה (תמונה או PDF בלבד)'); } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-orange-200/80 bg-orange-50/70 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="pending-license">
      <div className="min-w-0">
        <p className="text-sm font-bold text-orange-950">{p.kind === 'receipt' ? `🧾 ${p.title}: קבלה לא שויכה` : `🎵 ${p.title}: הרישיון ממתין`}</p>
        <p className="text-xs text-orange-900/80">{p.action}</p>
        {msg ? <p role="status" className="mt-1 text-xs font-bold text-teal-800">{msg}</p> : null}
      </div>
      {p.kind === 'receipt' ? <a href="#receipts" className={cn(opsGlassBtnPrimaryClass, 'shrink-0')}>לקבלה</a> : <label className={cn(opsGlassBtnPrimaryClass, 'shrink-0 cursor-pointer')}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}העלאת קבלה
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" disabled={busy} onChange={(e) => void send(e.target.files?.[0])} />
      </label>}
    </li>
  );
}

function ItemCard({ item, open, onToggle, onChanged }: { item: Item; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [busy, setBusy] = useState<'zip' | 'pdf' | 'verify' | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; sha: string | null } | null>(null);
  const K = KIND[item.kind] ?? KIND.file!;
  const src = thumbSrc(item);
  const loadRecs = useCallback(() => {
    fetch(`/api/v1/ops/legal/media/item?key=${encodeURIComponent(item.key)}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setRecs(d.records ?? [])).catch(() => setRecs([]));
  }, [item.key]);
  useEffect(() => { if (open && !recs) loadRecs(); }, [open, recs, loadRecs]);
  const q = encodeURIComponent(item.key);
  const run = async (kind: 'zip' | 'pdf' | 'verify') => {
    setBusy(kind); setErr(null);
    try {
      if (kind === 'verify') { const r = await fetch(`/api/v1/ops/legal/media/item/verify?key=${q}`, { method: 'POST' }); setVerify(await r.json()); }
      else {
        const steps = ['אוסף את הקובץ והרשומות...', 'מאמת חתימות וחותמות זמן...', 'מעצב את המסמך המשפטי...'];
        let n = 0; setStage(steps[0]!);
        const t = setInterval(() => { n = Math.min(n + 1, steps.length - 1); setStage(steps[n]!); }, 1400);
        try { setMade(await download(`/api/v1/ops/legal/media/item/export?key=${q}${kind === 'pdf' ? '&format=pdf' : ''}`, `media-evidence.${kind}`)); } finally { clearInterval(t); setStage(null); }
      }
    } catch { setErr(kind === 'verify' ? 'הבדיקה נכשלה' : 'הפקת התיק נכשלה'); } finally { setBusy(null); }
  };
  const changed = () => { setRecs(null); onChanged(); };
  return (
    <li className={cn(opsGlassCardClass, 'p-3 sm:p-4', !item.present && 'opacity-70')} data-testid="media-evidence-item">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 text-right">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-gc/50 bg-glass/70 backdrop-blur-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <K.Icon size={22} className="text-teal-700" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{item.title ?? item.path ?? item.key}</span>
          <span className="block truncate text-xs text-slate-500">{item.ai_description ?? item.path}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip className={STATUS[item.status].cls}>{STATUS[item.status].label}</Chip>
            <Chip className="border-gc/60 text-slate-700">{SOURCE_LABEL_HE[item.source_type]}</Chip>
            <Chip className="border-gc/60 text-slate-600">{K.label}</Chip>
            {['ai_image', 'ai_music', 'ai_voice'].includes(item.source_type) ? (item.coverage
              ? <Chip className="border-teal-300/70 bg-teal-500/10 text-teal-800">✓ נוצר במנוי בתשלום{item.coverage.plan ? ` · ${item.coverage.plan}` : ''}</Chip>
              : <Chip className="border-orange-300/70 text-orange-800">אין קבלה לתקופה</Chip>) : null}
            {item.metadata.c2pa ? <Chip className="border-teal-300/70 text-teal-800">C2PA</Chip> : null}
            {!item.present ? <Chip className="border-gc/60 text-slate-500">הוסר מהאתר</Chip> : null}
          </span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-slate-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="mt-4 space-y-4">
          <OpsDivider className="px-0 sm:px-0" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => run('zip')} disabled={!!busy} data-testid="media-need-evidence" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white shadow-lg shadow-amber-900/15 disabled:opacity-50">
              {busy === 'zip' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}אני צריך ראיה
            </button>
            <button type="button" onClick={() => run('pdf')} disabled={!!busy} className={opsGlassBtnClass}>{busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}PDF בלבד</button>
            <button type="button" onClick={() => run('verify')} disabled={!!busy} className={opsGlassBtnClass}>{busy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}בדיקת שלמות</button>
          </div>
          {stage ? <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs font-bold text-amber-900"><Loader2 size={14} className="animate-spin" />{stage}</p> : null}
          {made ? (
            <div role="status" className="rounded-2xl border border-teal-200/70 bg-teal-50/70 px-3 py-2.5 text-xs text-teal-900">
              <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 size={14} />התיק הופק והורד: {made.name}</p>
              {made.sha ? <p className="mt-1 break-all font-mono text-[10px] text-teal-800/80" dir="ltr">SHA-256 {made.sha}</p> : null}
              <p className="mt-1 text-[11px] text-teal-800/80">ההפקה נרשמה ביומן הגישה. עותק נשמר 7 ימים ואז נמחק, והראיות המקוריות נשמרות לצמיתות, כך שאפשר להפיק שוב בכל רגע.</p>
            </div>
          ) : null}
          {err ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{err}</p> : null}
          {verify ? (
            <p className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold', verify.ok ? 'border-teal-300/70 bg-teal-50/80 text-teal-800' : 'border-rose-300/70 bg-rose-50 text-rose-800')}>
              {verify.ok ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
              {verify.ok ? `כל ${verify.checks.length} הרשומות תקינות: שרשרת, חתימה וחותמת זמן${verify.file_ok ? ', והקובץ זהה למקור' : ''}` : 'נמצאו חריגות: ' + verify.checks.flatMap((c) => c.problems).join(', ')} · {fmt(verify.checked_at)}
            </p>
          ) : null}
          {item.kind === 'audio' && item.has_file ? <audio controls preload="none" src={`/api/v1/ops/legal/media/item/file?key=${q}`} className="w-full" /> : null}

          <details open={item.status !== 'verified'} className="group rounded-2xl border border-gc/50 bg-glass/50 backdrop-blur-md p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">מקור ורישיון<ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" /></summary>
            <div className="mt-3"><ProvenanceForm item={item} onSaved={changed} /></div>
          </details>
          <details open={['ai_music', 'ai_voice', 'ai_image'].includes(item.source_type)} className="group rounded-2xl border border-gc/50 bg-glass/50 backdrop-blur-md p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">קבלות, חשבוניות וצילומים<ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" /></summary>
            <div className="mt-3"><AttachmentBox item={item} onSaved={changed} /></div>
          </details>
          <details className="group rounded-2xl border border-gc/50 bg-glass/50 backdrop-blur-md p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">פרטי הקובץ והיכן בשימוש<ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" /></summary>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {([
                ['מיקום', item.path ?? '—', true], ['SHA-256', item.sha256 ?? '—', true], ['גיבוב תפיסתי', item.phash ?? '—', true],
                ['גודל', item.bytes ? `${(item.bytes / 1024).toFixed(1)} KB${item.width ? ` · ${item.width}×${item.height}` : ''}` : '—', false],
                ['הופעה ראשונה ב־git', item.first_commit ? `${fmt(item.first_commit.date)} · ${item.first_commit.author} · ${item.first_commit.sha.slice(0, 10)}` : '—', false],
                ['מידע מוטמע', [item.metadata.c2pa ? `C2PA ${item.metadata.c2pa_claim_generator ?? ''}` : null, item.metadata.software, item.metadata.digital_source_type, item.metadata.id3 ? Object.values(item.metadata.id3).join(' · ') : null].filter(Boolean).join(' · ') || 'אין', false],
              ] as Array<[string, string, boolean]>).map(([k, v, mono]) => (
                <div key={k} className="rounded-lg bg-glass/70 backdrop-blur-md px-3 py-2"><dt className="text-[11px] font-bold text-slate-500">{k}</dt><dd className={cn('break-all text-slate-800', mono && 'font-mono text-[11px]')} dir={mono ? 'ltr' : undefined}>{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] font-bold text-slate-500">בשימוש ב:</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">{(item.usages.length ? item.usages : ['לא נמצא שימוש']).map((u) => <li key={u}><Chip className="border-gc/60 text-slate-700">{u}</Chip></li>)}</ul>
          </details>
          <details className="group rounded-2xl border border-gc/50 bg-glass/50 backdrop-blur-md p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-800">רשומות חתומות ({item.records})<ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" /></summary>
            {!recs ? <Loader2 className="mx-auto my-3 animate-spin text-slate-400" /> : (
              <ol className="mt-3 space-y-1.5 border-r-2 border-teal-200/80 pr-3 text-xs">
                {recs.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">{i + 1}. {EVENT[r.event] ?? r.event}</span>
                    <span className="text-slate-500">{fmt(r.created_at)}</span>
                    <Chip className={r.tsa ? 'border-teal-300/70 text-teal-800' : 'border-rose-300/70 text-rose-700'}>{r.tsa ? '✓' : '✗'} חותמת זמן</Chip>
                    <Chip className={r.ots ? 'border-teal-300/70 text-teal-800' : 'border-gc/60 text-slate-500'}>{r.ots ? '✓' : '•'} עיגון</Chip>
                    {r.event === 'license_snapshot' ? <span className="truncate text-slate-500" dir="ltr">{String(r.summary.url ?? '')}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </div>
      ) : null}
    </li>
  );
}

export function AdminMediaEvidencePanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [ai, setAi] = useState<{ calls: number; total_usd: number } | null>(null);
  const [pending, setPending] = useState<Array<{ key: string; title: string; action: string; kind?: string }>>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | Item['status']>('all');
  const [kind, setKind] = useState<string>('all');
  const [stype, setStype] = useState<'all' | SourceType>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    fetch('/api/v1/ops/legal/media', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setItems(d.items); setAi(d.ai); setPending(d.pending ?? []); }).catch(() => setErr('לא הצלחנו לטעון את רשימת המדיה'));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, 60_000);
  useEffect(() => { const k = new URLSearchParams(window.location.search).get('asset'); if (k) { setOpen(k); setShowDone(true); } }, []);

  const rescan = async () => {
    setScan('סורק...');
    try { const r = await fetch('/api/v1/ops/legal/media/scan', { method: 'POST' }); const j = await r.json(); setScan(`נסרקו ${j.total}: ${j.new} חדשים, ${j.changed} השתנו`); load(); } catch { setScan('הסריקה נכשלה'); }
  };

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (items ?? []).filter((i) => (status === 'all' || i.status === status) && (kind === 'all' || i.kind === kind) && (stype === 'all' || i.source_type === stype) && words.every((w) => i.search.includes(w) || i.key.toLowerCase().includes(w)));
  }, [items, q, status, kind, stype]);
  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const i of items ?? []) by[i.source_type] = (by[i.source_type] ?? 0) + 1;
    return { by, missing: (items ?? []).filter((i) => i.status === 'missing_source').length, draft: (items ?? []).filter((i) => i.status === 'draft').length, verified: (items ?? []).filter((i) => i.status === 'verified').length };
  }, [items]);
  const todo = filtered.filter((i) => i.status !== 'verified');
  const done = filtered.filter((i) => i.status === 'verified');
  const filterBtn = (active: boolean) => cn('rounded-full border px-3 py-1.5 text-xs font-bold transition', active ? 'border-teal-400/70 bg-teal-600 text-white' : 'border-gc/60 bg-glass/50 backdrop-blur-md text-slate-700 hover:bg-glass/80');

  return (
    <div dir="rtl" className="space-y-4" data-testid="media-evidence-panel">
      <section className={cn(opsGlassCardClass, 'p-4 sm:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">מאיפה הגיע כל קובץ באתר</h2>
            <p className="mt-1 text-sm text-slate-600">כל תמונה, איור, שיר, גופן ואייקון נסרקים אוטומטית. לכל קובץ נשמרים העותק המקורי, טביעת אצבע, היסטוריית קוד ועמוד הרישיון, והכול נחתם ומקבל חותמת זמן.</p>
          </div>
          <button type="button" onClick={rescan} className={opsGlassBtnClass}><RefreshCw size={14} className={cn(scan === 'סורק...' && 'animate-spin')} />סריקה עכשיו</button>
        </div>
        {scan ? <p role="status" className="mt-2 text-xs font-bold text-slate-600">{scan}</p> : null}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {([['missing_source', counts.missing, 'חסר מקור', 'text-rose-700'], ['draft', counts.draft, 'חסרים פרטים', 'text-orange-700'], ['verified', counts.verified, 'מתועדים', 'text-teal-700']] as const).map(([s, n, l, c]) => (
            <button key={s} type="button" onClick={() => setStatus(status === s ? 'all' : s)} className={cn('rounded-2xl border px-2 py-3 transition', status === s ? 'border-teal-400/70 bg-glass/80 backdrop-blur-md' : 'border-gc/50 bg-glass/40 backdrop-blur-md hover:bg-glass/70')}>
              <span className={cn('block text-2xl font-black', c)}>{items ? n : '·'}</span><span className="text-xs font-bold text-slate-600">{l}</span>
            </button>
          ))}
        </div>
        {ai && ai.calls ? <p className="mt-3 text-[11px] text-slate-500">תיאור אוטומטי: {ai.calls} קבצים · עלות כוללת ${ai.total_usd.toFixed(4)} (בערך ${(ai.total_usd / ai.calls).toFixed(5)} לקובץ, פעם אחת בלבד)</p> : null}
      </section>

      <div className="sticky top-2 z-10 space-y-2 rounded-3xl border border-gc/50 bg-background-card/70 p-3 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur-2xl">
        <label className="relative block">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: שם, תיאור, יוצר, רישיון, עמוד באתר..." className={cn(opsInputClass, 'pr-9')} data-testid="media-evidence-search" />
          {q ? <button type="button" onClick={() => setQ('')} aria-label="ניקוי חיפוש" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-700"><X size={14} /></button> : null}
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {['all', 'image', 'illustration', 'icon', 'audio', 'video', 'font'].map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={cn(filterBtn(kind === k), 'shrink-0')}>{k === 'all' ? 'כל הסוגים' : KIND[k]!.label}</button>)}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button type="button" onClick={() => setStype('all')} className={cn(filterBtn(stype === 'all'), 'shrink-0')}>כל המקורות</button>
          {SOURCE_TYPES.filter((s) => counts.by[s]).map((s) => <button key={s} type="button" onClick={() => setStype(s)} className={cn(filterBtn(stype === s), 'shrink-0')}>{SOURCE_LABEL_HE[s]} · {counts.by[s]}</button>)}
        </div>
      </div>

      {pending.length ? (
        <section aria-label="פעולות פתוחות" className={cn(opsGlassCardClass, 'space-y-2 p-4')}>
          <h3 className="text-sm font-bold text-slate-900">פעולות שמחכות לך</h3>
          <ul className="space-y-2">{pending.map((p) => <PendingLicenseCard key={p.key} p={p} onDone={load} />)}</ul>
        </section>
      ) : null}
      <ReceiptsSection onChanged={load} />
      {err ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      {!items ? <div className={cn(opsGlassCardClass, 'grid place-items-center p-10')}><Loader2 className="animate-spin text-slate-400" /></div> : (
        <>
          <section aria-label="צריך את הקלט שלך" className="space-y-2">
            <h3 className="flex items-center gap-2 px-1 text-sm font-bold text-slate-700"><span className="grid h-6 w-6 place-items-center rounded-full bg-rose-100 text-xs text-rose-700">{todo.length}</span>צריך את הקלט שלך</h3>
            {todo.length ? <ul className="space-y-2">{todo.map((i) => <ItemCard key={i.key} item={i} open={open === i.key} onToggle={() => setOpen(open === i.key ? null : i.key)} onChanged={load} />)}</ul> : <p className={cn(opsGlassCardClass, 'p-4 text-center text-sm text-slate-500')}>אין פריטים פתוחים בסינון הזה 🎉</p>}
          </section>
          <OpsDivider />
          <section aria-label="מתועדים במלואם" className="space-y-2">
            <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="flex w-full items-center justify-between px-1 text-sm font-bold text-slate-700">
              <span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-teal-100 text-xs text-teal-700">{done.length}</span>מתועדים במלואם</span>
              <ChevronDown size={16} className={cn('text-slate-400 transition', showDone && 'rotate-180')} />
            </button>
            {showDone || q ? <ul className="space-y-2">{done.map((i) => <ItemCard key={i.key} item={i} open={open === i.key} onToggle={() => setOpen(open === i.key ? null : i.key)} onChanged={load} />)}</ul> : null}
          </section>
        </>
      )}
    </div>
  );
}
