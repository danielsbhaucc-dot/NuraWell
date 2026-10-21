'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

type Rule = {
  id: number;
  avoid: string;
  prefer: string;
  category: string;
  hits: number;
  active: boolean;
  auto_fix: boolean;
  reviewed: boolean;
  updated_at: string;
};
type Day = { day: string; notifications: number; lint_fix: number; lint_reject: number; qc_edit: number; qc_reject: number; sweep_fix: number };
type Ev = { created_at: string; stage: string; category: string; before_text: string; after_text: string | null };
type Data = { rules: Rule[]; meta: { version: number; updated_at: string } | null; daily: Day[]; recent: Ev[] };

const STAGE_HE: Record<string, string> = {
  lint_fix: 'תיקון אוטומטי',
  lint_reject: 'נפסל ונכתב מחדש',
  qc_edit: 'נערך בבדיקת איכות',
  qc_reject: 'תיקון שנדחה',
  sweep_fix: 'תוקן בסריקת הלילה',
};

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

function Toggle({ on, onChange, label, busy }: { on: boolean; onChange: (v: boolean) => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={[
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
        on ? 'bg-emerald-500' : 'bg-slate-300/80',
      ].join(' ')}
    >
      <span className={['absolute top-0.5 h-5 w-5 rounded-full bg-background-card shadow transition-all', on ? 'right-0.5' : 'right-5.5'].join(' ')} />
    </button>
  );
}

export function AdminNotifyQualityClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/notify-quality?days=30', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'הטעינה נכשלה');
      setData(j as Data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const patch = async (id: number, body: Partial<Pick<Rule, 'active' | 'auto_fix'>>) => {
    setBusy(id);
    try {
      const res = await fetch('/api/v1/admin/notify-quality', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'השמירה נכשלה');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/v1/admin/notify-quality?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'המחיקה נכשלה');
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  const totals = useMemo(() => {
    const d = data?.daily ?? [];
    const last7 = d.slice(-7);
    const prev7 = d.slice(-14, -7);
    const sum = (arr: Day[], k: keyof Day) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0);
    const rate = (arr: Day[]) => {
      const n = sum(arr, 'notifications');
      return { n, rej: sum(arr, 'lint_reject'), edit: sum(arr, 'qc_edit') + sum(arr, 'lint_fix') };
    };
    return { last: rate(last7), prev: rate(prev7) };
  }, [data]);

  const maxBar = Math.max(1, ...(data?.daily ?? []).map((d) => d.lint_reject + d.qc_edit + d.lint_fix));

  return (
    <div className="space-y-5" dir="rtl">
      <OpsPageHeader
        icon={Sparkles}
        eyebrow="איכות ההתראות"
        title="המערכת לומדת לנסח"
        tone="emerald"
        description="כל תיקון ופסילה נרשמים בלי פרטים מזהים. בכל לילה נבנית מהם רשימה קצרה של כללי ניסוח שנכנסת לכתיבת ההתראות."
      />

      {error ? <p className="rounded-xl border border-red-200/70 bg-red-50/70 px-3 py-2 text-sm font-medium text-red-800">{error}</p> : null}

      {!data ? (
        <p className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'פסילות ב-7 ימים', v: pct(totals.last.rej, totals.last.n), sub: `לעומת ${pct(totals.prev.rej, totals.prev.n)} בשבוע שלפני` },
              { label: 'עריכות ב-7 ימים', v: pct(totals.last.edit, totals.last.n), sub: `לעומת ${pct(totals.prev.edit, totals.prev.n)} בשבוע שלפני` },
              { label: 'התראות ב-7 ימים', v: String(totals.last.n), sub: 'נוצרו על ידי אלמוג' },
              { label: 'גרסת הכללים', v: String(data.meta?.version ?? 0), sub: `${data.rules.filter((r) => r.active).length} כללים פעילים` },
            ].map((c) => (
              <div key={c.label} className="rounded-3xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
                <p className="text-xs font-semibold text-slate-500">{c.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-800">{c.v}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-slate-700">שיעור פסילות ועריכות לפי יום</h2>
            <div className="mt-3 flex h-32 items-end gap-1" aria-label="גרף פסילות ועריכות ב-30 הימים האחרונים">
              {data.daily.map((d) => {
                const rej = d.lint_reject;
                const ed = d.qc_edit + d.lint_fix;
                return (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col-reverse"
                    title={`${d.day}: ${d.notifications} התראות, ${rej} פסילות (${pct(rej, d.notifications)}), ${ed} עריכות (${pct(ed, d.notifications)})`}
                  >
                    <div className="rounded-t-sm bg-rose-400/80" style={{ height: `${(rej / maxBar) * 100}%` }} />
                    <div className="bg-amber-400/80" style={{ height: `${(ed / maxBar) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" />פסילות</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />עריכות</span>
            </p>
          </section>

          <section className="rounded-3xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-slate-700">כללי ניסוח שנלמדו</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              רק טעויות שחזרו לפחות פעמיים. &quot;תיקון אוטומטי&quot; מחליף את הביטוי בכל התראה חדשה גם בלי בינה מלאכותית.
            </p>
            {data.rules.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">עדיין אין כללים. הם ייבנו בסריקת הלילה כשיצטברו טעויות חוזרות.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gc/50">
                {data.rules.map((r) => (
                  <li key={r.id} className={['flex flex-wrap items-center gap-3 py-3', r.active ? '' : 'opacity-60'].join(' ')}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">
                        <span className="text-rose-700 line-through decoration-rose-400/70">{r.avoid}</span>
                        {r.prefer ? <> ← <span className="font-semibold text-emerald-700">{r.prefer}</span></> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        חזר {r.hits} פעמים · {r.category}
                        {!r.reviewed && r.auto_fix ? ' · הוצע לתיקון אוטומטי' : ''}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      פעיל
                      <Toggle on={r.active} busy={busy === r.id} label="הפעלת הכלל" onChange={(v) => void patch(r.id, { active: v })} />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <Wand2 className="h-3.5 w-3.5" /> תיקון אוטומטי
                      <Toggle on={r.auto_fix} busy={busy === r.id || !r.prefer} label="תיקון אוטומטי" onChange={(v) => void patch(r.id, { auto_fix: v })} />
                    </label>
                    {confirmDelete === r.id ? (
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={() => void remove(r.id)} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-gc">
                          כן, למחוק
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-xl px-3 py-1.5 text-xs text-slate-600">
                          ביטול
                        </button>
                      </span>
                    ) : (
                      <button type="button" aria-label="מחיקת הכלל" onClick={() => setConfirmDelete(r.id)} className="rounded-xl p-2 text-slate-500 hover:bg-rose-50/60 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-slate-700">דוגמאות אחרונות</h2>
            <ul className="mt-3 space-y-2">
              {data.recent.map((e, i) => (
                <li key={i} className="rounded-2xl border border-gc/40 bg-background-card/40 p-3 text-sm">
                  <p className="text-xs font-semibold text-slate-500">
                    {STAGE_HE[e.stage] ?? e.stage} · {e.category} · {new Date(e.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                  </p>
                  <p className="mt-1 text-slate-600">{e.before_text}</p>
                  {e.after_text ? <p className="mt-1 font-medium text-emerald-800">{e.after_text}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
