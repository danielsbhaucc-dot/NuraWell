import { createClient } from '@/lib/supabase/server';
import { AdminJourneyHub } from '@/components/admin/AdminJourneyHub';
import type { JourneyStep } from '@/lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function OpsJourneyHubPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: stations }, { data: steps }] = await Promise.all([
    sb.from('journey_stations').select('*').order('sort_order', { ascending: true }).order('title', { ascending: true }),
    sb
      .from('journey_steps')
      .select('*, journey_stations(id,title,sort_order)')
      .order('step_number', { ascending: true }),
  ]);

  const stepRows = (steps ?? []) as JourneyStep[];

  return (
    <AdminJourneyHub
      initialStations={(stations ?? []) as Array<{ id: string; title: string; description: string | null; sort_order: number }>}
      initialSteps={stepRows}
    />
  );
}
