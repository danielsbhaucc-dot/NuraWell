'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock, Download, Globe, KeyRound, Loader2, LogIn, LogOut, RotateCw, Route, ShieldAlert, ShieldCheck, X, XCircle } from 'lucide-react';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { cn } from '@/lib/cn';
import type { LogInv } from '@/lib/logs/query';

type Kind = 'session' | 'fail' | 'success' | 'route' | 'export' | 'security' | 'auth';
type Inv = {
  subject: { user: string | null; ipHash: string | null; session: string | null; country: string | null; isAdmin: boolean; knownPlace: unknown };
  verdict: { level: 'low' | 'medium' | 'high'; headline: string; reasons: string[]; next: string[] };
  facts: { failsBefore: number; exports: number; routes: number; activeSessions: number };
  timeline: { ts: string; kind: Kind; title: string; detail?: string; country?: string | null }[];
  gaps: string[];
};
type Op = 'revoke_session' | 'block_ip' | 'sign_out_all' | 'ban';

const LEVEL = {
  high: { chip: 'border-rose-400/50 bg-rose-500/15 text-rose-800', ring: 'ring-rose-400/40', label: 'סיכון גבוה' },
  medium: { chip: 'border-amber-400/60 bg-amber-500/15 text-amber-800', ring: 'ring-amber-400/40', label: 'חשוד' },
  low: { chip: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-800', ring: 'ring-emerald-400/30', label: 'נראה תקין' },
} as const;
const KIND: Record<Kind, { I: typeof LogIn; cls: string }> = {
  fail: { I: XCircle, cls: 'text-rose-600' }, success: { I: CheckCircle2, cls: 'text-emerald-600' }, session: { I: LogIn, cls: 'text-teal-700' },
  auth: { I: KeyRound, cls: 'text-indigo-600' }, route: { I: Route, cls: 'text-slate-500' }, export: { I: Download, cls: 'text-amber-600' }, security: { I: ShieldAlert, cls: 'text-violet-600' },
};
const ACTIONS: { op: Op; label: string; sub: string; I: typeof Ban; needs: 'session' | 'ipHash' | 'user'; danger?: boolean }[] = [
  { op: 'revoke_session', label: 'ניתוק החיבור', sub: 'החיבור הזה יפסיק לעבוד מיד', I: LogOut, needs: 'session' },
  { op: 'block_ip', label: 'חסימת הכתובת ל-24 שעות', sub: 'כל בקשה ממנה תידחה', I: Ban, needs: 'ipHash' },
  { op: 'sign_out_all', label: 'ניתוק כל החיבורים של החשבון', sub: 'כולל מכשירים אחרים', I: LogOut, needs: 'user', danger: true },
  { op: 'ban', label: 'חסימת החשבון ל-24 שעות', sub: 'שחרור דורש קוד שחזור', I: ShieldAlert, needs: 'user', danger: true },
];
const t = (s: string) => new Date(s).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Investigation + block sheet opened from a log row. Bottom sheet on mobile, side panel on desktop. No native dialogs. */
export function IncidentSheet({ inv, onClose }: { inv: LogInv; onClose: () => void }) {
  const [data, setData] = useState<Inv | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepUp, setStepUp] = useState<null | (() => void)>(null);
  const [armed, setArmed] = useState<Op | null>(null);
  const [busy, setBusy] = useState<Op | null>(null);
  const [done, setDone] = useState<Partial<Record<Op, string>>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const q = new URLSearchParams();
  if (inv.session) q.set('session', inv.session); else if (inv.user) q.set('user', inv.user);
  if (inv.ipHash) q.set('iphash', inv.ipHash);
  const qs = q.toString();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/v1/ops/security/investigate?${qs}`, { cache: 'no-store', credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (j.stepUp) { setStepUp(() => () => void load()); return; }
      if (!r.ok) throw new Error(j.error ?? 'לא הצלחנו לטעון את החקירה.');
      setData(j as Inv);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [qs]);
  useEffect(() => { void load(); closeRef.current?.focus(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); const o = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o; };
  }, [onClose]);

  const target = { session: data?.subject.session ?? inv.session ?? null, ipHash: data?.subject.ipHash ?? inv.ipHash ?? null, user: data?.subject.user ?? inv.user ?? null };

  const run = async (op: Op) => {
    setBusy(op); setMsg(null);
    const body: Record<string, unknown> = { op };
    if (op === 'revoke_session') body.session = target.session;
    if (op === 'block_ip') { body.ipHash = target.ipHash; body.minutes = 1440; body.note = 'נחסם ממסך היומנים'; }
    if (op === 'sign_out_all') body.user = target.user;
    if (op === 'ban') { body.user = target.user; body.hours = 24; }
    try {
      const r = await fetch('/api/v1/ops/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (j.stepUp) { setStepUp(() => () => void run(op)); return; }
      if (!r.ok) throw new Error(j.error ?? 'הפעולה נכשלה.');
      setArmed(null); setDone((d) => ({ ...d, [op]: new Date().toISOString() }));
      setMsg({ tone: 'ok', text: 'בוצע. הפעולה נרשמה ביומן ונשלחה אליך התראה.' });
    } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };

  const lv = data ? LEVEL[data.verdict.level] : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-start" dir="rtl" data-testid="incident-sheet">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <section role="dialog" aria-modal="true" aria-labelledby="inc-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-gc/60 bg-gc/95 shadow-2xl backdrop-blur-xl sm:max-h-none sm:w-[30rem] sm:rounded-none sm:rounded-e-3xl dark:bg-slate-900/95">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300/80 sm:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-3">
          <h2 id="inc-title" className="flex items-center gap-2 text-[16px] font-bold text-slate-900 dark:text-gc"><ShieldAlert size={18} className="text-violet-600" />איך הוא נכנס</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-900/5"><X size={18} /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {loading && !data ? (
            <div className="space-y-3" data-testid="incident-loading" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-900/[0.06]" />)}
            </div>
          ) : err && !data ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800">
              {err}<button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-xl border border-rose-400/40 px-3 py-1.5 text-[13px]"><RotateCw size={14} />לנסות שוב</button>
            </div>
          ) : data && lv ? (
            <>
              <div className={cn('rounded-2xl bg-gc/70 p-4 ring-1', lv.ring)}>
                <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold', lv.chip)}>{lv.label}</span>
                <p className="mt-2 text-[15px] font-bold leading-snug text-slate-900 dark:text-gc">{data.verdict.headline}</p>
                <ul className="mt-2 space-y-1 text-[13px] text-slate-700 dark:text-slate-200">{data.verdict.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{r}</li>)}</ul>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
                  {data.subject.country ? <span className="inline-flex items-center gap-1"><Globe size={12} />{data.subject.country}</span> : null}
                  <span>{data.facts.failsBefore} ניסיונות כושלים לפני</span><span>{data.facts.routes} פעולות</span>{data.facts.exports ? <span className="font-semibold text-amber-700">{data.facts.exports} ייצואים</span> : null}
                  {data.subject.knownPlace ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={12} />מקום מוכר</span> : null}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="px-1 text-[12.5px] font-semibold text-slate-500">לחסום עכשיו</h3>
                {ACTIONS.filter((a) => target[a.needs]).map((a) => {
                  const isArmed = armed === a.op; const ok = done[a.op];
                  return (
                    <div key={a.op} className={cn('rounded-2xl border px-3 py-2.5 transition', isArmed ? 'border-rose-400/60 bg-rose-500/[0.07]' : 'border-slate-200/70 bg-gc/60')}>
                      <div className="flex items-center gap-3">
                        <a.I size={17} className={a.danger ? 'text-rose-600' : 'text-slate-600'} aria-hidden />
                        <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold text-slate-800 dark:text-gc">{a.label}</span><span className="block text-[12px] text-slate-500">{a.sub}</span></span>
                        {ok ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><CheckCircle2 size={14} />בוצע</span>
                          : isArmed ? null
                          : <button type="button" disabled={!!busy} onClick={() => setArmed(a.op)} className="min-h-9 rounded-xl border border-slate-300/80 px-3 text-[12.5px] font-semibold text-slate-700 disabled:opacity-50">ביצוע</button>}
                      </div>
                      {isArmed && !ok ? (
                        <div className="mt-2 flex items-center gap-2 border-t border-rose-300/40 pt-2">
                          <AlertTriangle size={14} className="shrink-0 text-rose-600" /><span className="flex-1 text-[12.5px] text-rose-800">בטוח? הפעולה מיידית ונרשמת ביומן.</span>
                          <button type="button" onClick={() => setArmed(null)} className="min-h-9 rounded-xl px-3 text-[12.5px] text-slate-600">ביטול</button>
                          <button type="button" disabled={!!busy} onClick={() => void run(a.op)} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-rose-600 px-3 text-[12.5px] font-bold text-rose-50 disabled:opacity-60">
                            {busy === a.op ? <Loader2 size={14} className="animate-spin" /> : null}כן, לבצע
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {msg ? <p role={msg.tone === 'err' ? 'alert' : 'status'} className={cn('px-1 text-[12.5px] font-semibold', msg.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</p> : null}
                <p className="px-1 text-[11.5px] text-slate-500">שחרור חסימה דורש קוד שחזור, במסך אבטחה.</p>
              </div>

              {data.verdict.next.length ? (
                <div className="rounded-2xl border border-slate-200/70 bg-gc/60 p-3">
                  <h3 className="text-[12.5px] font-semibold text-slate-500">מה עוד מומלץ</h3>
                  <ol className="mt-1.5 list-decimal space-y-0.5 ps-5 text-[13px] text-slate-700 dark:text-slate-200">{data.verdict.next.map((n) => <li key={n}>{n}</li>)}</ol>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-slate-500"><Clock size={13} />ציר זמן</h3>
                {data.timeline.length ? (
                  <ol className="relative ms-2 border-s border-slate-300/70 ps-4" data-testid="incident-timeline">
                    {data.timeline.map((e, i) => { const k = KIND[e.kind]; return (
                      <li key={`${e.ts}-${i}`} className="relative pb-3 last:pb-0">
                        <span className="absolute -start-[1.6rem] top-0.5 grid h-5 w-5 place-items-center rounded-full bg-gc ring-1 ring-slate-300/70 dark:bg-slate-800"><k.I size={11} className={k.cls} aria-hidden /></span>
                        <div className="text-[13px] font-medium text-slate-800 dark:text-gc">{e.title}</div>
                        <div className="text-[11.5px] text-slate-500"><span dir="ltr" className="tabular-nums">{t(e.ts)}</span>{e.country ? ` · ${e.country}` : ''}{e.detail ? <span className="block truncate" dir="ltr" title={e.detail}>{e.detail}</span> : null}</div>
                      </li>); })}
                  </ol>
                ) : <p className="py-4 text-center text-[13px] text-slate-500">אין אירועים שמורים בטווח הזה.</p>}
              </div>

              {data.gaps.length ? <div className="rounded-2xl bg-slate-900/[0.04] p-3 text-[12px] text-slate-500">{data.gaps.map((g) => <p key={g}>{g}</p>)}</div> : null}
            </>
          ) : null}
        </div>
      </section>
      <StepUpDialog open={!!stepUp} purpose="ops.sensitive" reason="חקירה וחסימה של חדירה" onClose={() => { setStepUp(null); setLoading(false); }} onVerified={() => { const f = stepUp; setStepUp(null); f?.(); }} />
    </div>
  );
}
