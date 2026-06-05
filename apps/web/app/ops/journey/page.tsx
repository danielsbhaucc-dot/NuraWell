import Link from 'next/link';
import { ListTree } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AdminStepsList } from '@/components/admin/AdminStepsList';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
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
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={ListTree}
        eyebrow="ניהול מסע"
        title="ניהול צעדי מסע"
        tone="amber"
        description={
          <>
            עריכה, פרסום ומחיקה של צעדים. לניהול תחנות וקיבוץ —{' '}
            <Link
              href="/journey-hub"
              className="font-bold text-emerald-700 underline decoration-emerald-400/50 underline-offset-2 hover:text-emerald-800"
            >
              מסע ותחנות
            </Link>
            .
          </>
        }
      />
      <AdminStepsList steps={(steps as JourneyStep[]) || []} showIntro={false} />
    </div>
  );
}
