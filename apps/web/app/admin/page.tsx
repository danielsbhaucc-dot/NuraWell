import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminStepsList } from '../../components/admin/AdminStepsList';
import type { JourneyStep } from '../../lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/courses');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: steps } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .order('step_number');

  return <AdminStepsList steps={(steps as JourneyStep[]) || []} />;
}
