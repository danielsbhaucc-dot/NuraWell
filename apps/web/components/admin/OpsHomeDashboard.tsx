'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Footprints, ImageIcon, LayoutDashboard, Route, Sparkles } from 'lucide-react';

type OpsHomeDashboardProps = {
  publishedCount: number;
  totalSteps: number;
};

export function OpsHomeDashboard({ publishedCount, totalSteps }: OpsHomeDashboardProps) {
  const pathname = usePathname() ?? '';
  const opsBase = pathname.startsWith('/ops') ? '/ops' : '';

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-3xl border border-white/60 bg-white/50 p-5 shadow-[0_12px_40px_rgba(99,102,241,0.1)] backdrop-blur-xl sm:p-7">
        <p className="font-sans text-sm font-semibold uppercase tracking-wide text-violet-700/90">לוח בקרה</p>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
          <LayoutDashboard className="h-7 w-7 shrink-0 text-emerald-600 sm:h-8 sm:w-8" aria-hidden />
          ראשי
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-slate-600 sm:text-base">
          סיכום מהיר של המסע וקיצורי דרך לניהול. להגדרות תמונת אלמוג ניתן לעבור מתפריט הצד, מהסרגל התחתון
          במובייל או מהכרטיס למטה.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <div className="rounded-3xl border border-cyan-300/50 bg-gradient-to-br from-cyan-100/70 via-white/55 to-sky-100/50 p-4 shadow-[0_12px_40px_rgba(14,165,233,0.12)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-cyan-400/55 sm:hover:shadow-[0_14px_44px_rgba(14,165,233,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-semibold text-cyan-900/85">צעדים במסע</p>
              <p className="mt-1 font-display text-3xl font-black tabular-nums text-slate-900">{totalSteps}</p>
              <p className="mt-2 font-sans text-xs text-slate-600">{publishedCount} פורסמו ללקוחות</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/55 text-cyan-700 shadow-sm backdrop-blur-md">
              <Footprints className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>

        <Link
          href={opsBase ? `${opsBase}/journey` : '/journey'}
          className="group block rounded-3xl border border-emerald-400/40 bg-gradient-to-br from-emerald-200/55 via-teal-100/45 to-cyan-100/50 p-4 shadow-[0_12px_40px_rgba(16,185,129,0.14)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-emerald-500/50 sm:hover:shadow-[0_14px_48px_rgba(16,185,129,0.22)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-semibold text-emerald-900/90">הגדרות מסע</p>
              <p className="mt-1 font-display text-lg font-black text-slate-900">ניהול צעדים</p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-emerald-950/75">רשימת צעדים, יצירה ועריכה</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/55 bg-white/50 text-emerald-700 shadow-sm backdrop-blur-md transition-transform group-hover:scale-105">
              <Route className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </Link>

        <div className="rounded-3xl border border-violet-300/45 bg-gradient-to-br from-violet-100/55 via-fuchsia-50/40 to-white/45 p-4 shadow-[0_12px_40px_rgba(139,92,246,0.1)] backdrop-blur-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-semibold text-violet-900/90">סטטוס מערכת</p>
              <p className="mt-1 font-display text-lg font-black text-slate-900">הכל תקין</p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-violet-950/75">
                הפאנל והמסד זמינים. ניטור שגיאות יתווסף בעתיד.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/55 bg-white/50 text-violet-600 shadow-sm backdrop-blur-md">
              <Activity className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>

        <Link
          href={opsBase ? `${opsBase}/almog` : '/almog'}
          className="group block rounded-3xl border border-amber-300/50 bg-gradient-to-br from-amber-100/55 via-orange-50/45 to-rose-50/40 p-4 shadow-[0_12px_40px_rgba(245,158,11,0.12)] backdrop-blur-xl transition-all active:scale-[0.99] sm:p-5 sm:hover:border-amber-400/55 sm:hover:shadow-[0_14px_44px_rgba(245,158,11,0.18)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-semibold text-amber-900/90">אלמוג</p>
              <p className="mt-1 font-display text-lg font-black text-slate-900">הגדרות תמונת פרופיל</p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-amber-950/80">עדכון התמונה שמוצגת בצ&apos;אט ובהתראות</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/55 bg-white/50 text-amber-700 shadow-sm backdrop-blur-md transition-transform group-hover:scale-105">
              <span className="flex items-center gap-0.5" aria-hidden>
                <ImageIcon className="h-5 w-5 opacity-90" />
                <Sparkles className="h-3.5 w-3.5 -mr-1 text-amber-600" />
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
