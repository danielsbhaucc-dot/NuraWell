import { createClient } from '../../../lib/supabase/server';
import { AdminStepsList } from '../../../components/admin/AdminStepsList';
import type { JourneyStep } from '../../../lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function AdminJourneyPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .order('step_number');

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-black leading-tight text-slate-800 sm:text-3xl">ניהול צעדי מסע</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 sm:text-base">
          עריכה, פרסום ומחיקה של צעדים במסע המשתמשים.
        </p>
      </div>
      <AdminStepsList steps={(steps as JourneyStep[]) || []} showIntro={false} />
    </div>
  );
}
