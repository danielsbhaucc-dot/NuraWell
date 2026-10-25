'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Receipt, RefreshCw, TrendingUp, Wallet, Users, UserPlus } from 'lucide-react';
import type { CostLedgerPayload } from '@/lib/admin/cost-ledger';

const ils = (n: number | null | undefined, d = 2) => (n == null ? '—' : `₪${n.toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const MONTHS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const monthLabel = (m: string) => `${MONTHS_HE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const SOURCE_LABEL: Record<string, string> = { invoice: 'לפי חשבונית', estimate: 'הערכה עד חשבונית', metered: 'לפי שימוש בפועל', free: 'חינמי', subscription: 'מנוי' };
const CAT_LABEL: Record<string, string> = { ai: 'AI', infra: 'תשתית', tools: 'כלי יצירה', domain: 'דומיין', other: 'אחר' };

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gc/60 bg-linear-to-br from-emerald-50/80 to-background-card/60 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs font-bold text-emerald-700"><Icon className="h-4 w-4" aria-hidden />{label}</div>
      <div className="mt-1 text-2xl font-black text-ink" dir="ltr">{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-faint">{sub}</div> : null}
    </div>
  );
}

export function AdminCostLedger() {
  const [data, setData] = useState<CostLedgerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/admin/costs/ledger', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as CostLedgerPayload);
    } catch {
      setError('לא הצלחנו לטעון את ספר העלויות. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="flex items-center justify-center gap-2 rounded-2xl border border-gc/60 bg-background-card/55 p-8 text-sm text-ink-faint"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />טוען עלויות וקבלות…</div>;
  }
  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
        {error} <button type="button" onClick={() => void load()} className="underline">רענון</button>
      </div>
    );
  }
  if (!data) return null;
  const cur = data.current;
  const maxMonth = Math.max(1, ...data.months.map((m) => (m.partial ? data.projectedCurrentIls : m.totalIls)));
  const flags = [...data.missing.map((f) => ({ ...f, kind: 'קבלה חסרה' })), ...data.spikes.map((f) => ({ ...f, kind: 'קפיצה' }))];

  return (
    <section dir="rtl" className="space-y-4" aria-labelledby="ledger-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ledger-title" className="flex items-center gap-2 text-lg font-black text-ink"><Wallet className="h-5 w-5 text-emerald-600" aria-hidden />עלות כוללת חודשית — קבלות + שימוש</h2>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 rounded-xl border border-gc/60 bg-background-card/60 px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-background-card disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />רענון
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Wallet} label={`סה״כ ${monthLabel(cur.month)} עד היום`} value={ils(cur.totalIls)} sub={`צפי לסוף החודש: ${ils(data.projectedCurrentIls)} · חודש הבא: ${ils(data.projectedNextIls)}`} />
        <Kpi icon={Users} label="עלות למשתמש פעיל (חציון)" value={ils(cur.perActiveMedianIls)} sub={`ממוצע ${ils(cur.perActiveMeanIls)} · p90 ${ils(cur.perActiveP90Ils)} · ${cur.activeUsers} פעילים`} />
        <Kpi icon={TrendingUp} label="עלות למשתמש משלם" value={ils(cur.perPayingIls)} sub={`${cur.payingUsers} משלמים`} />
        <Kpi icon={UserPlus} label="עלות שולית למשתמש נוסף" value={ils(cur.marginalIls)} sub="רק עלות משתנה — קבועות לא גדלות" />
      </div>

      {flags.length ? (
        <ul className="space-y-1.5">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><b>{f.kind} · {f.label}:</b> {f.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-2xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
        <h3 className="mb-3 text-sm font-black text-ink">מגמה (3 חודשים + נוכחי)</h3>
        <div className="space-y-2">
          {data.months.map((m) => {
            const v = m.partial ? data.projectedCurrentIls : m.totalIls;
            return (
              <div key={m.month} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 font-bold text-ink-soft">{monthLabel(m.month)}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${m.partial ? 'bg-emerald-300' : 'bg-emerald-500'}`} style={{ width: `${(v / maxMonth) * 100}%` }} />
                </div>
                <span className="w-36 shrink-0 text-left font-bold text-ink" dir="ltr">{ils(m.totalIls)}{m.partial ? ` → ${ils(data.projectedCurrentIls, 0)}` : ''}</span>
                <span className="hidden w-28 shrink-0 text-ink-faint sm:block">{m.activeUsers} פעילים · {ils(m.perActiveMedianIls)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gc/60 bg-background-card/55 backdrop-blur-xl">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="p-3 text-right text-sm font-black text-ink">על מה אני משלם — {monthLabel(cur.month)}</caption>
          <thead className="text-xs text-ink-faint"><tr><th className="p-2 text-right">ספק</th><th className="p-2 text-right">שירות</th><th className="p-2 text-right">סוג</th><th className="p-2 text-right">מקור המספר</th><th className="p-2 text-left">החודש</th></tr></thead>
          <tbody>
            {cur.byVendor.map((v) => (
              <tr key={v.vendor} className="border-t border-gc/40">
                <td className="p-2 font-bold text-ink">{v.label}{v.plan ? <span className="mr-1 text-xs font-normal text-ink-faint">({v.plan})</span> : null}</td>
                <td className="p-2 text-xs text-ink-soft">{v.service}</td>
                <td className="p-2 text-xs">{CAT_LABEL[v.category]} · {v.kind === 'fixed' ? 'קבוע' : 'לפי שימוש'}</td>
                <td className="p-2 text-xs text-ink-soft">{SOURCE_LABEL[v.source]}{v.cashOutIls > 0 ? ` · טעינת קרדיט ${ils(v.cashOutIls)}` : ''}</td>
                <td className="p-2 text-left font-bold" dir="ltr">{ils(v.ils)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-gc/60 font-black"><td className="p-2" colSpan={4}>סה״כ (קבוע {ils(cur.fixedIls)} · משתנה {ils(cur.variableIls)})</td><td className="p-2 text-left" dir="ltr">{ils(cur.totalIls)}</td></tr></tfoot>
        </table>
      </div>

      <div className="rounded-2xl border border-gc/60 bg-background-card/55 p-4 backdrop-blur-xl">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-ink"><Receipt className="h-4 w-4" aria-hidden />קבלות שנקלטו</h3>
        {data.receipts.length === 0 ? <p className="text-sm text-ink-faint">עוד לא נקלטו קבלות בתקופה.</p> : (
          <ul className="divide-y divide-gc/40">
            {data.receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-ink-faint" dir="ltr">{r.date ?? '—'}</span>
                <span className="font-bold text-ink">{r.vendorLabel}</span>
                {r.plan ? <span className="text-xs text-ink-faint">{r.plan}</span> : null}
                <span className="font-bold" dir="ltr">{r.amount == null ? 'ללא סכום' : `${r.amount} ${r.currency ?? ''}`}</span>
                {r.ils != null && r.currency !== 'ILS' ? <span className="text-xs text-ink-faint" dir="ltr">≈ {ils(r.ils)}</span> : null}
                {r.vatIls ? <span className="text-xs text-ink-faint">מע״מ {ils(r.vatIls)}</span> : null}
                {r.trust !== 'verified' ? <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">{r.trust === 'rejected' ? 'נדחתה' : 'לבדיקה'}</span> : null}
                <span className="ms-auto flex flex-wrap gap-2">
                  {r.files.map((f) => (
                    <a key={f.i} href={`/api/v1/admin/costs/receipt-file?id=${r.id}&i=${f.i}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                      <FileText className="h-3.5 w-3.5" aria-hidden />{f.name}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          קבלות נקלטות אוטומטית מ: {data.coverage.filter((c) => c.autoReceipts).map((c) => c.label).join(', ')}. שער המרה: {data.fx.source}{data.fx.usdIls ? ` (1$ = ₪${data.fx.usdIls})` : ''}. חשבונית היא מקור האמת לחודש שלה; עד שמגיעה — הערכה לפי שימוש. טעינות קרדיט לא נספרות פעמיים.
        </p>
      </div>
    </section>
  );
}
