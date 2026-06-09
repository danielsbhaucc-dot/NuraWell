import { createClient } from '@/lib/supabase/server';
import type { JourneyStep } from '@/lib/types/journey';
import { OpsHomeDashboard } from '@/components/admin/OpsHomeDashboard';

export const dynamic = 'force-dynamic';

export default async function OpsHomePage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await supabase
    .from('journey_steps')
    .select('id,is_published')
    .order('step_number');

  const list = (steps as Pick<JourneyStep, 'id' | 'is_published'>[]) || [];
  const publishedCount = list.filter((s) => s.is_published).length;

  return <OpsHomeDashboard publishedCount={publishedCount} totalSteps={list.length} />;
}
