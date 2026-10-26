import { Activity, Boxes, Coins, KeyRound, TriangleAlert, Users } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import type { ProductMetrics } from '@/lib/platform/product-metrics';
import { cn } from '@/lib/cn';

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const num = (n: number) => n.toLocaleString('he-IL');

export function ProductsControlPlane({ rows, error }: { rows: ProductMetrics[]; error: string | null }) {
  const totalCost = rows.reduce((s, r) => s + r.aiCost30dUsd, 0);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-3 sm:p-6" dir="rtl">
      <OpsPageHeader
        icon={Boxes}
        eyebrow="לוח בקרה מרכזי"
        title="כל המוצרים"
        description="כל מוצר שרשום בפלטפורמה, עם המספרים העיקריים שלו. הכניסה, מנוע ה-AI, האבטחה והתשלומים משותפים לכולם."
      />

      {error ? (
        <div className={cn(opsGlassCardClass, 'text-sm font-semibold text-rose-700')} role="alert">
          לא הצלחתי לטעון את המספרים כרגע. הרשימה תופיע כשהחיבור יחזור.
        </div>
      ) : null}

      {!error && rows.length === 0 ? (
        <div className={cn(opsGlassCardClass, 'text-sm text-slate-600')}>אין מוצרים שיש לך הרשאה לראות.</div>
      ) : null}

      {rows.length > 0 ? (
        <p className="px-1 text-sm text-slate-600">
          עלות AI ב-30 הימים האחרונים בכל המוצרים יחד: <span className="font-bold text-slate-900">{usd(totalCost)}</span>
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.productId} className={opsGlassCardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl font-black text-slate-900">{r.name}</h2>
                {r.description ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.description}</p> : null}
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                  r.status === 'active' ? 'bg-emerald-500/15 text-emerald-800' : 'bg-slate-500/15 text-slate-700',
                )}
              >
                {r.status === 'active' ? 'פעיל' : 'מושבת'}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat icon={Users} label="משתמשים" value={num(r.users)} />
              <Stat icon={Coins} label="עלות AI ב-30 יום" value={usd(r.aiCost30dUsd)} />
              <Stat icon={Activity} label="קריאות AI ב-30 יום" value={num(r.aiCalls30d)} />
              <Stat icon={TriangleAlert} label="שגיאות ב-7 ימים" value={num(r.errors7d)} warn={r.errors7d > 0} />
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <KeyRound size={14} aria-hidden />
              מפתח הצפנה נפרד למוצר הזה
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Users; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-gc/50 bg-background-card/35 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Icon size={14} aria-hidden />
        {label}
      </dt>
      <dd className={cn('mt-1 text-lg font-black', warn ? 'text-rose-700' : 'text-slate-900')}>{value}</dd>
    </div>
  );
}
