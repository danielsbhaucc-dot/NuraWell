'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileText, Image as ImageIcon, Loader2, Search, ShieldAlert, ShieldCheck, Scale, Mail } from 'lucide-react';
import { OpsDivider, opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { Divider } from '@/components/admin/hub/Divider';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { AdminLegalPrecheck, type PreCheckState } from '@/components/admin/AdminLegalPrecheck';

type UserRow = { user_id: string; name: string | null; email: string | null; events: number; last_action: string; last_at: string };
type Ev = {
  id: string; reference: string; created_at: string; action: 'grant' | 'withdraw'; source: string; text_version: string;
  typed_word: string; checkbox: boolean; ip: string | null; user_agent: string | null; record_hash: string; has_screenshot: boolean;
  text_lines: string[]; tsa_time: string | null; ots: number; email_receipt: boolean;
};
type Detail = { user: { id: string; name: string | null; email: string | null; created_at: string | null }; events: Ev[]; access_log: Array<{ created_at: string; path: string }> };
type Check = { id: string; chain: boolean; signature: boolean; snapshot: boolean; record_hash: boolean; tsa: { ok: boolean }; ots: { calendars: number }; screenshot: { present: boolean; ok: boolean | null }; email_receipt: boolean; problems: string[] };

const fmt = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso)) : '—';
const SRC: Record<string, string> = { onboarding: 'הרשמה', settings_privacy: 'הגדרות', chat: 'שיחה', prompt: 'חלון הסכמה' };
const LOG: Record<string, string> = { legal_view_timeline: 'צפייה בציר הזמן', legal_verify: 'בדיקת שלמות', legal_export_package: 'הפקת תיק ראיות', legal_view_image: 'צפייה בצילום', legal_download_image: 'הורדת צילום' };

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
      ok === null ? 'border-gc/60 text-ink-faint' : ok ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-800' : 'border-rose-300/70 bg-rose-500/10 text-rose-800')}>
      {ok === null ? '•' : ok ? '✓' : '✗'} {label}
    </span>
  );
}

export function AdminLegalPanel() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<{ ok: boolean; checked_at: string; checks: Check[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, setPwTick] = useState(0);
  const [made, setMade] = useState<string | null>(null);
  const [pre, setPre] = useState<PreCheckState | null>(null);
  const [ovr, setOvr] = useState(false);
  const [ovrReason, setOvrReason] = useState('');
  const [ovrAck, setOvrAck] = useState(false);
  const [logsStepUp, setLogsStepUp] = useState<string | null>(null);
  const blocked = !pre || pre.critical > 0;
  const overrideReady = !!pre && pre.critical > 0 && ovrAck && ovrReason.trim().length >= 10;

  useEffect(() => {
    fetch('/api/v1/ops/legal/users', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setUsers(d.users)).catch(() => setErr('לא הצלחנו לטעון את הרשימה'));
  }, []);

  useEffect(() => { const u = new URLSearchParams(window.location.search).get('user'); if (u) void pick(u); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = useCallback(async (id: string) => {
    setSel(id); setDetail(null); setChecks(null); setPre(null); setOvr(false); setOvrReason(''); setOvrAck(false); setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/v1/ops/legal/user/${id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setDetail(await r.json());
    } catch { setErr('לא הצלחנו לטעון את התיעוד'); } finally { setLoading(false); }
  }, []);

  const verify = async () => {
    if (!sel) return; setBusy('verify');
    try { const r = await fetch(`/api/v1/ops/legal/user/${sel}/verify`, { method: 'POST' }); setChecks(await r.json()); } catch { setErr('הבדיקה נכשלה'); } finally { setBusy(null); }
  };
  const download = async (fmtKind: 'zip' | 'pdf') => {
    if (!sel) return; setBusy(fmtKind === 'zip' ? 'export' : 'pdf');
    try {
      const qs = new URLSearchParams();
      if (fmtKind === 'pdf') qs.set('format', 'pdf');
      if (pre && pre.critical > 0) { qs.set('override', '1'); qs.set('override_reason', ovrReason.trim()); }
      const r = await fetch(`/api/v1/ops/legal/user/${sel}/export${qs.size ? `?${qs}` : ''}`);
      if (r.status === 409) { setErr('ההפקה חסומה: יש כשלים חמורים פתוחים בבדיקה שלפני ההפקה.'); return; }
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get('x-export-file') ?? '') || `evidence.${fmtKind}`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMade(name); setPwTick((t) => t + 1);
    } catch { setErr('הפקת התיק נכשלה'); } finally { setBusy(null); }
  };

  /** On demand only: provider logs for one event (encrypted ZIP, 7-day copy, permanent generation log). */
  const pullLogs = async (eventId: string) => {
    if (!sel) return; setBusy(`logs:${eventId}`);
    try {
      const r = await fetch(`/api/v1/ops/legal/user/${sel}/platform-logs?evidence=${eventId}`, { method: 'POST' });
      if (r.status === 403 && ((await r.clone().json().catch(() => ({}))) as { stepUp?: boolean }).stepUp) { setLogsStepUp(eventId); return; }
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get('x-export-file') ?? '') || 'provider-logs.zip';
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMade(name); setPwTick((t) => t + 1);
    } catch { setErr('שליפת יומני הספק נכשלה'); } finally { setBusy(null); }
  };

  const filtered = (users ?? []).filter((u) => !q || `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const checkFor = (id: string) => checks?.checks.find((c) => c.id === id);

  return (
    <div dir="rtl" className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className={cn(opsGlassCardClass, 'p-4')} aria-label="משתמשים">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-xs text-amber-700">1</span>משתמשים עם תיעוד</h2>
        <label className="relative block">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מייל" className="w-full rounded-xl border border-gc/60 bg-glass/70 backdrop-blur-md py-2.5 pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
        </label>
        <OpsDivider className="my-3 px-0 sm:px-0" />
        {!users ? <Loader2 className="mx-auto my-6 animate-spin text-ink-faint" /> : filtered.length === 0 ? <p className="py-6 text-center text-sm text-ink-faint">אין עדיין תיעוד</p> : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {filtered.map((u, i) => (
              <li key={u.user_id} className="relative py-1">
                {i > 0 ? <Divider tone="teal" className="absolute inset-x-3 top-0" /> : null}
                <button type="button" onClick={() => pick(u.user_id)} className={cn('w-full rounded-xl border px-3 py-2.5 text-right transition', sel === u.user_id ? 'border-emerald-300 bg-emerald-50/80' : 'border-transparent hover:bg-glass/60')}>
                  <span className="block truncate text-sm font-bold text-ink">{u.name || 'ללא שם'}</span>
                  <span className="block truncate text-xs text-ink-faint" dir="ltr">{u.email}</span>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">{u.events} אירועים · אחרון: {u.last_action === 'grant' ? 'הסכמה' : 'ביטול'} {fmt(u.last_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        {err ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
        {!sel ? (
          <div className={cn(opsGlassCardClass, 'grid place-items-center p-10 text-center text-ink-faint')}><Scale className="mb-2 text-amber-500" />בחרו משתמש כדי לראות את ציר ההסכמות</div>
        ) : loading || !detail ? (
          <div className={cn(opsGlassCardClass, 'grid place-items-center p-10')}><Loader2 className="animate-spin text-ink-faint" /></div>
        ) : (
          <>
            <div className={cn(opsGlassCardClass, 'p-4 sm:p-5')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{detail.user.name || 'ללא שם'}</h2>
                  <p className="text-sm text-ink-faint" dir="ltr">{detail.user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={verify} disabled={!!busy} className={cn(opsGlassBtnClass, 'gap-2')}>{busy === 'verify' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}בדיקת שלמות</button>
                  <button type="button" onClick={() => download('pdf')} disabled={!!busy || (blocked && !overrideReady)} className={cn(opsGlassBtnClass, 'gap-2')}>{busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}PDF בלבד</button>
                  <button type="button" onClick={() => download('zip')} disabled={!!busy || (blocked && !overrideReady)} data-testid="legal-need-evidence"
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-amber-500 to-amber-600 px-4 text-sm font-bold text-white shadow-lg shadow-amber-900/15 disabled:opacity-50">
                    {busy === 'export' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}אני צריך ראיה
                  </button>
                </div>
              </div>
              {pre && pre.critical > 0 ? (
                <div className="mt-3 rounded-2xl border border-rose-300/60 bg-rose-500/5 p-3 backdrop-blur" data-testid="precheck-override">
                  {!ovr ? (
                    <button type="button" onClick={() => setOvr(true)} className="text-sm font-bold text-rose-800 underline">להפיק בכל זאת (עקיפה מתועדת)</button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[13px] leading-relaxed text-rose-900">העקיפה נרשמת ביומן, והמסמך יציין בעמוד הראשון שהופק למרות הכשלים, מי אישר, מתי ולמה.</p>
                      <label className="block text-xs font-bold text-ink-soft">למה צריך להפיק עכשיו (לפחות 10 תווים)
                        <textarea value={ovrReason} onChange={(e) => setOvrReason(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-gc/60 bg-glass/70 px-3 py-2 text-sm font-normal outline-none backdrop-blur-md focus:ring-2 focus:ring-rose-300" />
                      </label>
                      <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                        <input type="checkbox" checked={ovrAck} onChange={(e) => setOvrAck(e.target.checked)} className="h-4 w-4 accent-rose-600" />
                        אני מבין שהמסמך יציג את הכשלים בגלוי
                      </label>
                    </div>
                  )}
                </div>
              ) : null}
              {made ? (
                <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-50/40 px-3 py-2 text-[13px] font-semibold text-emerald-900 backdrop-blur">הקובץ {made} הורד ומוצפן. הסיסמה שלו מחכה בלשונית ״תיקי ראיות״.</p>
              ) : null}
              {checks ? (
                <div className={cn('mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold', checks.ok ? 'border-emerald-300/70 bg-emerald-50/80 text-emerald-800' : 'border-rose-300/70 bg-rose-50 text-rose-800')}>
                  {checks.ok ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                  {checks.ok ? `כל ${checks.checks.length} הרשומות תקינות: שרשרת, חתימה, נוסח, חותמת זמן וצילום` : 'נמצאו חריגות — פירוט בכל אירוע'} · {fmt(checks.checked_at)}
                </div>
              ) : null}
            </div>

            <AdminLegalPrecheck userId={detail.user.id} onChange={setPre} />
            <div className="flex items-center gap-2 text-sm font-bold text-ink-soft"><span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-xs text-amber-700">2</span>ציר זמן</div>
            <ol className="relative space-y-3 border-r-2 border-amber-200/80 pr-5">
              {detail.events.map((e, i) => {
                const c = checkFor(e.id);
                const isOpen = open === e.id;
                return (
                  <li key={e.id} className={cn(opsGlassCardClass, 'relative p-4')}>
                    <span className={cn('absolute -right-[29px] top-5 h-4 w-4 rounded-full border-2 border-white', e.action === 'grant' ? 'bg-emerald-500' : 'bg-rose-500')} aria-hidden />
                    <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} className="flex w-full items-start justify-between gap-3 text-right" aria-expanded={isOpen}>
                      <div>
                        <p className="font-bold text-ink">{i + 1}. {e.action === 'grant' ? 'מתן הסכמה' : 'ביטול הסכמה'} <span className="text-xs font-semibold text-ink-faint">· {SRC[e.source] ?? e.source}</span></p>
                        <p className="text-xs text-ink-faint">{fmt(e.created_at)} · <span dir="ltr">{e.reference}</span></p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Pill ok={e.tsa_time ? true : false} label="חותמת זמן" />
                          <Pill ok={e.ots > 0} label="עיגון ציבורי" />
                          <Pill ok={e.email_receipt} label="קבלה במייל" />
                          {c ? <><Pill ok={c.chain && c.record_hash} label="שרשרת" /><Pill ok={c.signature} label="חתימה" /><Pill ok={c.snapshot} label="נוסח" /><Pill ok={c.screenshot.present ? c.screenshot.ok : null} label="צילום" /></> : null}
                        </div>
                      </div>
                      <ChevronDown size={18} className={cn('mt-1 shrink-0 text-ink-faint transition', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen ? (
                      <div className="mt-4 grid gap-4 border-t border-amber-200/60 pt-4 md:grid-cols-2">
                        <dl className="space-y-2 text-sm">
                          {[
                            ['מילה שהוקלדה', `"${e.typed_word}"`],
                            ['תיבת אישור', e.checkbox ? 'סומנה' : 'לא סומנה'],
                            ['גרסת נוסח', e.text_version],
                            ['כתובת IP', e.ip ?? '—'],
                            ['מכשיר', e.user_agent ?? '—'],
                            ['חותמת זמן מוסמכת', fmt(e.tsa_time)],
                          ].map(([k, v]) => (
                            <div key={k} className="rounded-lg bg-glass/60 backdrop-blur-md px-3 py-2"><dt className="text-[11px] font-bold text-ink-faint">{k}</dt><dd className="break-words text-ink">{v}</dd></div>
                          ))}
                          <div className="rounded-lg bg-glass/60 backdrop-blur-md px-3 py-2"><dt className="text-[11px] font-bold text-ink-faint">גיבוב הרשומה</dt><dd className="break-all font-mono text-[11px] text-ink-soft" dir="ltr">{e.record_hash}</dd></div>
                        </dl>
                        <div className="space-y-3">
                          {e.has_screenshot ? (
                            <figure className="overflow-hidden rounded-xl border border-amber-200 bg-glass/85 backdrop-blur-md">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/api/v1/ops/legal/image/${e.id}`} alt="צילום חלון ההסכמה" className="max-h-[420px] w-full object-contain" loading="lazy" />
                              <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-ink-faint">
                                <span className="flex items-center gap-1"><ImageIcon size={13} />צילום החלון</span>
                                <a href={`/api/v1/ops/legal/image/${e.id}?download=1`} className="font-bold text-emerald-700 underline">הורדה</a>
                              </figcaption>
                            </figure>
                          ) : <p className="rounded-xl bg-glass/60 backdrop-blur-md p-3 text-xs text-ink-faint">אין צילום לאירוע זה</p>}
                          <button type="button" onClick={() => pullLogs(e.id)} disabled={!!busy} className={cn(opsGlassBtnClass, 'w-full justify-center gap-2 text-xs')} data-testid="legal-provider-logs">
                            {busy === `logs:${e.id}` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}שליפת יומני ספק לאירוע הזה
                          </button>
                          <details className="rounded-xl bg-glass/60 backdrop-blur-md p-3 text-xs text-ink-soft">
                            <summary className="cursor-pointer font-bold">הנוסח שהוצג</summary>
                            <div className="mt-2 space-y-1">{e.text_lines.map((l, j) => <p key={j}>{l}</p>)}</div>
                          </details>
                          {c && c.problems.length ? <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">חריגות: {c.problems.join(', ')}</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <div className="flex items-center gap-2 text-sm font-bold text-ink-soft"><span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-xs text-amber-700">3</span>יומן גישה לתיעוד</div>
            <ul className={cn(opsGlassCardClass, 'p-2 text-sm')}>
              {detail.access_log.length === 0 ? <li className="p-3 text-ink-faint">אין גישות קודמות</li> : detail.access_log.map((l, i) => (
                <li key={i} className="relative flex justify-between gap-3 px-3 py-2">{i > 0 ? <Divider tone="teal" className="absolute inset-x-3 top-0" /> : null}<span>{LOG[l.path] ?? l.path}</span><span className="text-xs text-ink-faint">{fmt(l.created_at)}</span></li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-xs text-ink-faint"><Mail size={13} />כל צפייה, בדיקה והפקה נרשמות ביומן הגישה ונכללות בתיק הראיות.</p>
          </>
        )}
      </section>
      <StepUpDialog open={!!logsStepUp} purpose="ops.sensitive" reason="שליפת יומני ספק לתיק ראיות" onClose={() => setLogsStepUp(null)} onVerified={() => { const id = logsStepUp; setLogsStepUp(null); if (id) void pullLogs(id); }} />
    </div>
  );
}
