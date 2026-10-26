import Link from 'next/link';
import { getPlan } from '@/lib/billing/plans';

/** Account settings: the user's (display-only) plan + link to all plans. */
export function CurrentPlanCard({ plan }: { plan: string | null | undefined }) {
  const p = getPlan(plan);
  return (
    <section dir="rtl" aria-label="המנוי שלי" className="mx-auto mb-28 mt-2 flex w-full max-w-xl items-center justify-between gap-3 rounded-3xl border border-[#cfd0d6] bg-[#faf7ef] px-5 py-4">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-[#15803d]">המנוי שלי</span>
        <span className="text-lg font-black text-[#14532d]">{p.name}</span>
      </div>
      <Link href="/pricing" className="min-h-10 rounded-full bg-[#e8e8ed] px-4 py-2 text-sm font-bold text-[#14532d]">כל המסלולים</Link>
    </section>
  );
}
