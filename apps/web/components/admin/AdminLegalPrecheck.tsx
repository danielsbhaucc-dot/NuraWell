'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

type Item = {
  key: string; severity: 'critical' | 'warn' | 'ok'; title: string; what: string; steps: string[];
  fix: string | null; fixLabel?: string; events: Array<{ n: number; id: string; reference: string }>;
};
export type PreCheckState = { checkedAt: string; critical: number; warn: number; items: Item[]; canExport: boolean };

const SEV = {
  critical: { label: 'חמור', Icon: AlertOctagon, chip: 'border-coral-300/70 bg-coral-500/10 text-coral-800', bar: 'bg-coral-500' },
  warn: { label: 'אזהרה', Icon: AlertTriangle, chip: 'border-accent-300/70 bg-accent-500/10 text-accent-800', bar: 'bg-accent-500' },
  ok: { label: 'תקין', Icon: CheckCircle2, chip: 'border-primary-300/70 bg-primary-500/10 text-primary-800', bar: 'bg-primary-500' },
} as const;

/** Pre-export checklist: every issue in plain Hebrew, severity, steps, one-click fixes, "בדוק שוב". */
export function AdminLegalPrecheck({ userId, onChange }: { userId: string; onChange: (s: PreCheckState | null) => void }) {
  const [pc, setPc] = useState<PreCheckState | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const set = useCallback((s: PreCheckState | null) => { setPc(s); onChange(s); }, [onChange]);
  const run = useCallback(async () => {
    setLoading(true); setNote(null);
    try {
      const r = await fetch(`/api/v1/ops/legal/user/${userId}/precheck`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      set(await r.json());
    } catch { setNote('הבדיקה לא הצליחה. אפשר לנסות שוב.'); set(null); } finally { setLoading(false); }
  }, [userId, set]);
  useEffect(() => { void run(); }, [run]);

  const fix = async (it: Item) => {
    if (!it.fix) return;
    setFixing(it.key); setNote(null);
    try {
      const r = await fetch(`/api/v1/ops/legal/user/${userId}/precheck`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: it.fix, event_ids: it.events.length ? it.events.map((e) => e.id) : undefined }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as PreCheckState & { done: number };
      set(d);
      setNote(d.done ? `בוצע (${d.done}). הבדיקה רצה שוב.` : 'הפעולה רצה, אבל לא היה מה לעדכן כרגע.');
    } catch { setNote('התיקון לא הצליח. אפשר לנסות שוב בעוד דקה.'); } finally { setFixing(null); }
  };

  return (
    <section className={cn(opsGlassCardClass, 'p-4 sm:p-5')} aria-label="בדיקה לפני הפקה" data-testid="legal-precheck" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-100 text-xs text-accent-700">✓</span>
            בדיקה לפני הפקת מסמך
          </h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            {pc ? `${pc.critical} חמורים · ${pc.warn} אזהרות · נבדק ${new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', timeStyle: 'short' }).format(new Date(pc.checkedAt))}` : 'בודק את כל הרשומות, הצילומים, החותמות והקבלות'}
          </p>
        </div>
        <button type="button" onClick={run} disabled={loading || !!fixing} className={cn(opsGlassBtnClass, 'gap-2')} data-testid="precheck-rerun">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}בדוק שוב
        </button>
      </div>
      {pc ? (
        <div className={cn('mt-3 rounded-2xl border px-3 py-2 text-sm font-semibold', pc.critical ? 'border-coral-300/70 bg-coral-500/10 text-coral-800' : 'border-primary-300/70 bg-primary-500/10 text-primary-800')}>
          {pc.critical ? 'יש כשלים חמורים. ההפקה חסומה עד שיטופלו, או עם עקיפה מתועדת.' : pc.warn ? 'אפשר להפיק. האזהרות יופיעו בגלוי בעמוד הראשון של המסמך.' : 'הכול תקין. אפשר להפיק.'}
        </div>
      ) : null}
      {note ? <p role="status" className="mt-2 text-sm text-ink-soft">{note}</p> : null}
      <div className="my-3 h-px bg-gradient-to-l from-transparent via-accent-300/80 to-transparent" aria-hidden />
      {loading && !pc ? <Loader2 className="mx-auto my-4 animate-spin text-ink-faint" /> : (
        <ul className="space-y-2">
          {(pc?.items ?? []).map((it) => {
            const s = SEV[it.severity];
            const isOpen = open === it.key;
            return (
              <li key={it.key} className="relative overflow-hidden rounded-2xl border border-gc/60 bg-glass/60 backdrop-blur">
                <span className={cn('absolute inset-y-0 right-0 w-1', s.bar)} aria-hidden />
                <button type="button" onClick={() => setOpen(isOpen ? null : it.key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-right">
                  <s.Icon size={18} className={cn('mt-0.5 shrink-0', it.severity === 'critical' ? 'text-coral-600' : it.severity === 'warn' ? 'text-accent-600' : 'text-primary-600')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">{it.title}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-bold', s.chip)}>{s.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">{it.what}</span>
                    {it.events.length ? <span className="mt-1 block text-[11px] text-ink-faint">אירועים: {it.events.map((e) => `${e.n}`).join(', ')}</span> : null}
                  </span>
                  <ChevronDown size={16} className={cn('mt-1 shrink-0 text-ink-faint transition', isOpen && 'rotate-180')} aria-hidden />
                </button>
                {isOpen ? (
                  <div className="border-t border-gc/50 px-4 pb-4 pt-3">
                    <p className="mb-1.5 text-xs font-bold text-ink-soft">מה לעשות</p>
                    <ol className="list-decimal space-y-1 pr-5 text-[13px] leading-relaxed text-ink-soft">
                      {it.steps.map((st) => <li key={st}>{st}</li>)}
                    </ol>
                    {it.fix ? (
                      <button type="button" onClick={() => fix(it)} disabled={!!fixing || loading} data-testid={`precheck-fix-${it.key}`}
                        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-primary-600 to-secondary-600 px-4 text-sm font-bold text-on-dark shadow-lg shadow-primary-900/15 disabled:opacity-50">
                        {fixing === it.key ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}{it.fixLabel ?? 'לתקן'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
