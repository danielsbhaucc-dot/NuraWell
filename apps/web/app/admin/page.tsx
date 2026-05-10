import Link from 'next/link';
import { createClient } from '../../lib/supabase/server';
import type { JourneyStep } from '../../lib/types/journey';
import { LayoutDashboard, Route, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await (supabase as any)
    .from('journey_steps')
    .select('id,is_published')
    .order('step_number');

  const list = (steps as Pick<JourneyStep, 'id' | 'is_published'>[]) || [];
  const publishedCount = list.filter((s) => s.is_published).length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-3xl border border-white/35 bg-white/35 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700/90">לוח בקרה</p>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
          <LayoutDashboard className="h-7 w-7 shrink-0 text-emerald-600 sm:h-8 sm:w-8" aria-hidden />
          ראשי
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          סיכום מהיר של המסע וקיצורי דרך לניהול. להגדרות תמונת אלמוג ניתן לעבור מתפריט הצד או מהכרטיס למטה.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <div className="rounded-3xl border border-white/35 bg-white/40 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-emerald-300/40 sm:hover:shadow-[0_12px_44px_rgba(16,185,129,0.18)]">
          <p className="text-sm font-semibold text-slate-600">צעדים במסע</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{list.length}</p>
          <p className="mt-2 text-xs text-slate-500">{publishedCount} פורסמו ללקוחות</p>
        </div>

        <Link
          href="/admin/journey"
          className="group block rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-900/15 via-emerald-800/10 to-teal-900/20 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-emerald-400/45 sm:hover:shadow-[0_12px_44px_rgba(16,185,129,0.22)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-900/90">הגדרות מסע</p>
              <p className="mt-1 text-lg font-black text-slate-900">ניהול צעדים</p>
              <p className="mt-2 text-xs leading-relaxed text-emerald-950/75">רשימת צעדים, יצירה ועריכה</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/45 text-emerald-700 shadow-sm backdrop-blur-md transition-transform group-hover:scale-105">
              <Route className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </Link>

        <Link
          href="/admin/almog"
          className="group block rounded-3xl border border-slate-400/25 bg-gradient-to-br from-slate-800/12 via-slate-700/10 to-slate-900/18 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all active:scale-[0.99] sm:col-span-2 sm:p-5 sm:hover:border-slate-500/35 sm:hover:shadow-[0_12px_44px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">אלמוג</p>
              <p className="mt-1 text-lg font-black text-slate-900">הגדרות תמונת פרופיל</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">עדכון התמונה שמוצגת בצ&apos;אט ובהתראות</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/45 text-slate-700 shadow-sm backdrop-blur-md transition-transform group-hover:scale-105">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
