'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, KeyRound, Loader2, Lock, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { buildZip, fmtDate, renderShareCard, WHERE, type ClientBundle } from '@/lib/security/key-backup-bundle';

type Status = { last: { at: string; inventory: { name: string; fingerprint: string }[]; regenerated: boolean } | null; stepUp: boolean };

/** Mirrors passphraseScore on the server (server is the authority). */
function score(p: string) {
  if (p.length < 16) return Math.min(2, Math.floor(p.length / 6));
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /[\u0590-\u05FF]/, /\s/].filter((r) => r.test(p)).length;
  const uniq = new Set(p).size;
  let s = 2;
  if (p.length >= 20) s++;
  if (classes >= 2 && uniq >= 10) s++;
  if (/(.)\1{3,}/.test(p) || uniq < 6) s = 1;
  return Math.min(4, s);
}
const METER = [
  { t: 'קצרה מדי', c: 'bg-rose-500' },
  { t: 'חלשה', c: 'bg-rose-400' },
  { t: 'בינונית', c: 'bg-amber-500' },
  { t: 'חזקה', c: 'bg-teal-500' },
  { t: 'חזקה מאוד', c: 'bg-indigo-500' },
];

function save(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function printHtml(html: string) {
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (w) w.addEventListener('load', () => w.print(), { once: true });
}

export function AdminKeyBackup() {
  const [st, setSt] = useState<Status | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [dbKey, setDbKey] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; stepup?: boolean } | null>(null);
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    fetch('/api/v1/admin/key-backup', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setSt(d as Status); }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch('/api/v1/admin/key-backup', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setSt(d as Status); }).catch(() => {});
  }, []);

  const sc = useMemo(() => score(pass), [pass]);
  const canGo = pass.length >= 16 && sc >= 3 && pass === pass2 && !busy && (!st?.last || regen);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/v1/admin/key-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: pass, regenerate: !!st?.last, ...(dbKey ? { db_backup_identity: dbKey } : {}) }) });
      const j = (await r.json().catch(() => ({}))) as { bundle?: ClientBundle; error?: string; message?: string };
      if (!r.ok || !j.bundle) { setErr({ msg: j.message ?? 'יצירת הגיבוי נכשלה. נסו שוב.', stepup: j.error === 'stepup' }); return; }
      setBundle(j.bundle); setPass(''); setPass2(''); setDbKey(null); setDone({}); load();
    } catch {
      setErr({ msg: 'אין חיבור לשרת. נסו שוב.' });
    } finally { setBusy(false); }
  };

  const [stepUp, setStepUp] = useState(false);
  const reauth = async () => { setStepUp(true); };

  const mark = (k: string) => setDone((d) => ({ ...d, [k]: true }));
  const allDone = bundle && ['zip', 's1', 's2', 's3'].every((k) => done[k]);

  return (
    <div className="space-y-4" dir="rtl" data-testid="key-backup">
      <StepUpDialog open={stepUp} purpose="ops.sensitive" reason="יצירת גיבוי מפתחות" onClose={() => setStepUp(false)} onVerified={() => { setStepUp(false); setErr(null); void generate(); }} />
      <section className={cn(opsGlassCardClass, 'relative overflow-hidden p-5 sm:p-6')}>
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-indigo-400/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-0 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-teal-500 text-indigo-50 shadow-lg"><KeyRound size={22} /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-ink">גיבוי מפתחות ההצפנה</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">יוצרים פעם אחת עותק נעול של המפתחות שפותחים את המידע המוצפן. אם השרת ייפגע, אפשר יהיה לשחזר הכול בעזרתו. אף אחד, כולל הבוט, לא רואה את המפתחות עצמם.</p>
            {st?.last ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-800"><CheckCircle2 size={14} />גיבוי אחרון: {fmtDate(st.last.at)}</p>
            ) : st ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-800"><ShieldAlert size={14} />עדיין לא נוצר גיבוי</p>
            ) : null}
          </div>
        </div>
      </section>

      {!bundle && (
        <section className={cn(opsGlassCardClass, 'space-y-3 p-5 sm:p-6')}>
          <h3 className="flex items-center gap-2 font-black text-ink"><Lock size={18} />בחירת סיסמה לגיבוי</h3>
          <p className="text-sm text-ink-soft">הכי קל לזכור: 4 מילים ומספר, למשל ״חתול-ירוק-שוקולד-ים-47״. את הסיסמה שומרים במנהל הסיסמאות.</p>
          <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="סיסמת הגיבוי (16 תווים לפחות)"
            className="min-h-[48px] w-full rounded-2xl border border-gc/60 bg-background-card/70 px-4 text-base" aria-label="סיסמת הגיבוי" />
          <div className="flex items-center gap-2" aria-live="polite">
            <div className="flex h-2 flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cn('h-2 flex-1 rounded-full', i < sc ? METER[sc].c : 'bg-slate-300/50')} />)}</div>
            <span className="w-20 text-xs font-bold text-ink-soft">{pass ? METER[sc].t : ''}</span>
          </div>
          <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="להקליד שוב את הסיסמה"
            className="min-h-[48px] w-full rounded-2xl border border-gc/60 bg-background-card/70 px-4 text-base" aria-label="אימות הסיסמה" />
          {pass2 && pass !== pass2 && <p className="text-xs font-bold text-rose-700">הסיסמאות לא זהות</p>}
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-gc/60 bg-background-card/50 p-3 text-sm text-ink-soft">
            <input type="file" accept=".txt,text/plain" className="sr-only" aria-label="קובץ מפתח הגיבוי של מסד הנתונים"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f || f.size > 4096) return;
                const m = /AGE-SECRET-KEY-1[0-9A-Z]{58}/.exec(await f.text());
                setDbKey(m ? m[0] : null);
                setErr(m ? null : { msg: 'הקובץ הזה לא נראה כמו מפתח הגיבוי של מסד הנתונים.' });
              }} />
            <KeyRound size={18} className="shrink-0" />
            <span className="flex-1">{dbKey ? <b className="text-teal-800">מפתח הגיבוי של מסד הנתונים נוסף, ויישמר בגיבוי הזה</b> : <>לא חובה: להוסיף את קובץ <b>מפתח הגיבוי של מסד הנתונים</b> (אם קיבלת אותו)</>}</span>
          </label>
          {st?.last && (
            <label className="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-900">
              <input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} className="mt-1" />
              <span>כבר קיים גיבוי. אני רוצה ליצור גיבוי חדש. הגיבוי הקודם עדיין יעבוד, ולכן כדאי להשמיד את העותקים שלו. הפעולה נרשמת ביומן.</span>
            </label>
          )}
          <button type="button" disabled={!canGo} onClick={() => void generate()}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-l from-indigo-600 to-teal-600 font-black text-indigo-50 shadow-lg disabled:opacity-50">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}{busy ? 'יוצר גיבוי מוצפן...' : 'יצירת גיבוי מפתחות'}
          </button>
          {err && (
            <div className="rounded-2xl border border-rose-300/60 bg-rose-500/10 p-3 text-sm text-rose-900" role="alert">
              {err.msg}
              {err.stepup && <button type="button" onClick={() => void reauth()} className={cn(opsGlassBtnClass, 'mt-2 w-full')}>אימות מחדש</button>}
            </div>
          )}
        </section>
      )}

      {bundle && (
        <section className={cn(opsGlassCardClass, 'space-y-3 p-5 sm:p-6')} data-testid="key-backup-result">
          <h3 className="flex items-center gap-2 font-black text-ink"><CheckCircle2 className="text-teal-600" size={18} />הגיבוי מוכן. 4 צעדים, כל אחד למקום אחר:</h3>
          <Step n={1} done={done.zip} title="תיקיית הגיבוי (מדריך, דף שחזור, קבצים נעולים)" where="לשמור בענן (Drive או iCloud) וגם על דיסק און קי. בטוח לשמור אותה, כי בלי סיסמה היא נעולה."
            actions={<button type="button" className={opsGlassBtnClass} onClick={() => { save(`nurawell-key-backup-${bundle.createdAt.slice(0, 10)}.zip`, buildZip(bundle) as BlobPart, 'application/zip'); mark('zip'); }}><Download size={16} />הורדה</button>} />
          {bundle.shares.map((s, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const html = renderShareCard(s, n, bundle.createdAt);
            return (
              <Step key={n} n={n + 1} done={done[`s${n}`]} title={`חלק שחזור ${n}`} where={`${WHERE[i]}.${n === 2 ? ' מעתיקים את השורה לרשומה חדשה במנהל הסיסמאות.' : ' מדפיסים ושומרים את הדף.'}`}
                actions={<>
                  <button type="button" className={opsGlassBtnClass} onClick={() => { printHtml(html); mark(`s${n}`); }}><Printer size={16} />הדפסה</button>
                  {n === 2 && <button type="button" className={opsGlassBtnClass} onClick={() => { void navigator.clipboard.writeText(s); mark('s2'); }}>העתקה</button>}
                </>} />
            );
          })}
          {allDone ? (
            <button type="button" onClick={() => setBundle(null)} className="min-h-[48px] w-full rounded-2xl bg-teal-600/90 font-bold text-teal-50">סיימתי, אפשר לסגור</button>
          ) : (
            <p className="text-xs text-ink-faint">אחרי הסגירה החלקים לא יוצגו שוב. גם בשרת הם לא נשמרים.</p>
          )}
        </section>
      )}
    </div>
  );
}

function Step({ n, title, where, actions, done }: { n: number; title: string; where: string; actions: React.ReactNode; done?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', done ? 'border-teal-300/60 bg-teal-500/10' : 'border-gc/50 bg-background-card/50')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-600 to-teal-500 text-sm font-black text-indigo-50">{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1"><p className="font-bold text-ink">{title}</p><p className="text-sm text-ink-soft">{where}</p></div>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  );
}
