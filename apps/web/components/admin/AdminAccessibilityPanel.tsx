'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import type { AccessibilityAuditSummary } from '@/lib/a11y/types';
import { opsGlassBtnClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

export function AdminAccessibilityPanel() {
  const [audit, setAudit] = useState<AccessibilityAuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/accessibility/audit', { credentials: 'include' });
      const data = (await res.json()) as AccessibilityAuditSummary & { error?: string };
      if (!res.ok) throw new Error(data.error || 'טעינת ביקורת נכשלה');
      setAudit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const generateAndSave = async (assetId: string) => {
    setBusyId(assetId);
    try {
      const res = await fetch('/api/v1/admin/accessibility/generate-alt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, save: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'יצירת alt נכשלה');
      await loadAudit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/50 bg-white/35 p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm font-black text-slate-900">ביקורת alt במדיה</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              סריקה של תמונות במאגר המדיה ללא טקסט חלופי. ניתן ליצור alt אוטומטי בעברית ולשמור.
            </p>
          </div>
          <button type="button" onClick={() => void loadAudit()} className={opsGlassBtnClass}>
            רענן
          </button>
        </div>

        {loading ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            טוען…
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {audit && !loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="סה״כ תמונות" value={audit.totalImages} />
            <StatCard label="חסר alt" value={audit.missingAlt} tone="warn" />
            <StatCard label="alt ריק" value={audit.emptyAlt} tone="warn" />
          </div>
        ) : null}
      </div>

      {audit && audit.samples.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/50 bg-white/30 backdrop-blur-xl">
          <div className="border-b border-white/40 px-4 py-3">
            <p className="text-sm font-black text-slate-900">דוגמאות לתיקון</p>
          </div>
          <ul className="divide-y divide-slate-200/60">
            {audit.samples.map((sample) => (
              <li key={sample.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {sample.title || 'ללא כותרת'}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">{sample.folder || 'ללא תיקייה'}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === sample.id}
                  onClick={() => void generateAndSave(sample.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-xl bg-emerald-800/85 px-3 py-2 text-xs font-bold text-white disabled:opacity-50',
                  )}
                >
                  {busyId === sample.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  צור alt
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-teal-200/60 bg-teal-50/70 px-4 py-3 text-xs leading-relaxed text-teal-950">
        <p className="font-bold">טיפ</p>
        <p className="mt-1">
          בעריכת מדיה בודדת ניתן גם ליצור alt ולערוך לפני שמירה. מומלץ לבדוק alt אוטומטי לפני פרסום.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-3',
        tone === 'warn'
          ? 'border-amber-200/80 bg-amber-50/80'
          : 'border-slate-200/70 bg-white/70',
      )}
    >
      <p className="text-[11px] font-bold text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}
