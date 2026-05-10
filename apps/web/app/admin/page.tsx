import Link from 'next/link';
import { createClient } from '../../lib/supabase/server';
import { AdminAlmogAvatarPanel } from '../../components/admin/AdminAlmogAvatarPanel';
import type { JourneyStep } from '../../lib/types/journey';
import { LayoutDashboard, Route } from 'lucide-react';

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
      <div>
        <h1 className="mb-2 flex flex-wrap items-center gap-2 text-2xl font-black leading-tight text-slate-800 sm:text-3xl">
          <LayoutDashboard className="h-7 w-7 shrink-0 text-emerald-500 sm:h-8 sm:w-8" aria-hidden />
          ראשי
        </h1>
        <p className="text-sm leading-relaxed text-slate-500 sm:text-base">
          סקירה מהירה והגדרות ליווי (אלמוג) במערכת.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:shadow-[0_8px_30px_rgb(16,185,129,0.08)]">
          <p className="text-sm font-semibold text-slate-500">צעדים במסע</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-800">{list.length}</p>
          <p className="mt-2 text-xs text-slate-500">{publishedCount} פורסמו ללקוחות</p>
        </div>
        <Link
          href="/admin/journey"
          className="group block rounded-3xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-emerald-200 sm:hover:shadow-[0_8px_30px_rgb(16,185,129,0.12)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">הגדרות מסע</p>
              <p className="mt-1 text-lg font-black text-slate-800">ניהול צעדים</p>
              <p className="mt-2 text-xs text-emerald-900/70">מעבר לרשימת הצעדים, יצירה ועריכה</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-emerald-600 shadow-sm transition-transform group-hover:scale-105">
              <Route className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </Link>
      </div>

      <AdminAlmogAvatarPanel />
    </div>
  );
}
