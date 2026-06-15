'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, UserX, ArrowRight } from 'lucide-react';
import { AlmogScreenCoach } from '../ai/AlmogScreenCoach';
import {
  listDeclinedTasksFromReport,
  type DeclinedTaskRow,
  type JourneyReportStepShape,
} from '../../lib/journey/journey-report-parse';

type JourneyReportResponse = { steps: JourneyReportStepShape[] };

export function DeclinedTasksPageClient() {
  const [rows, setRows] = useState<DeclinedTaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/journey-report', { cache: 'no-store' });
      const json = (await res.json()) as JourneyReportResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה');
      setRows(listDeclinedTasksFromReport(json.steps ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-emerald-800">
        <Loader2 className="h-9 w-9 animate-spin" />
        <p className="mt-3 text-sm font-semibold text-emerald-900/75">טוען משימות…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-sm text-red-700 font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-sm font-bold text-emerald-700 underline"
        >
          ננסה שוב
        </button>
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center space-y-4">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(236,253,245,0.9), rgba(167,243,208,0.45))',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <UserX className="h-8 w-8 text-emerald-700" strokeWidth={2} />
        </div>
        <p className="text-[15px] font-black text-[#1A1730]">אין משימות שלא לקחת על עצמך</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          אם סימנתם &quot;לא מקובל&quot; בסיכום צעד — המשימות יופיעו כאן. אפשר לחזור לצעד במסע ולעדכן את הבחירה.
        </p>
        <Link
          href="/journey"
          className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-bold text-white text-sm"
          style={{
            background: 'linear-gradient(135deg, #047857, #10b981)',
            boxShadow: '0 6px 20px rgba(16,185,129,0.28)',
          }}
        >
          <span>למסע שלי</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto w-full min-w-0 px-4 py-4 space-y-4 pb-8">
      <AlmogScreenCoach
        title="לא לקחת משימה? זה מידע, לא כישלון"
        body="אלמוג יכול לעזור להבין למה משימה נדחתה ולהציע גרסה קטנה וריאלית יותר, בלי לחץ ובלי אשמה."
        prompt="אלמוג, תעזור לי להבין את המשימות שסימנתי לא מקובל. איך אפשר להקטין אותן או למצוא חלופה שמתאימה לי?"
        cta="מצא איתי חלופה"
        tone="amber"
      />

      <p className="text-xs font-semibold text-emerald-900/75 text-right leading-relaxed">
        רשימה דינמית לפי מה שסימנתם במסע. לחיצה על צעד פותחת את השיעור לעדכון.
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={`${row.stepId}-${row.taskId}`}>
            <Link
              href={`/journey/${row.stepId}`}
              className="block rounded-[22px] p-[1px] transition active:scale-[0.99]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(251,113,133,0.4), rgba(254,215,170,0.3), rgba(255,255,255,0.55))',
                boxShadow: '0 10px 32px rgba(6,78,59,0.08)',
              }}
            >
              <div
                className="rounded-[21px] px-4 py-3.5 text-right"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,241,242,0.38) 100%)',
                  border: '1px solid rgba(255,255,255,0.65)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <p className="text-[11px] font-bold text-rose-800/85 mb-1">
                  צעד {row.stepNumber}: {row.stepTitle}
                </p>
                <p className="text-[15px] font-black text-[#1A1730] leading-snug [overflow-wrap:anywhere] break-words">
                  {row.taskTitle}
                </p>
                <p className="text-[11px] font-semibold text-emerald-800/70 mt-2">פתיחת השיעור ←</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
