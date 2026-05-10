import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AdminStepsList } from '@/components/admin/AdminStepsList';
import type { JourneyStep } from '@/lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function OpsJourneyPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await (supabase as any)
    .from('journey_steps')
    .select('*, journey_stations(id,title,sort_order)')
    .order('step_number');

  return (
    <div>
      <div className="mb-6 rounded-3xl border border-white/35 bg-white/35 p-5 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:mb-8 sm:p-6">
        <h1 className="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">ניהול צעדי מסע</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 sm:text-base">
          עריכה, פרסום ומחיקה של צעדים. לניהול תחנות וקיבוץ —{' '}
          <Link
            href="/journey-hub"
            className="font-bold text-emerald-700 underline decoration-emerald-400/50 underline-offset-2 hover:text-emerald-800"
          >
            מסע ותחנות
          </Link>
          .
        </p>
      </div>
      <AdminStepsList steps={(steps as JourneyStep[]) || []} showIntro={false} />
    </div>
  );
}
