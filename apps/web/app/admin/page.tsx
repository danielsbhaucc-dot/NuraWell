import { createClient } from '../../lib/supabase/server';
import { AdminStepsList } from '../../components/admin/AdminStepsList';
import { AdminAlmogAvatarPanel } from '../../components/admin/AdminAlmogAvatarPanel';
import type { JourneyStep } from '../../lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .order('step_number');

  return (
    <div>
      <AdminAlmogAvatarPanel />
      <AdminStepsList steps={(steps as JourneyStep[]) || []} />
    </div>
  );
}
