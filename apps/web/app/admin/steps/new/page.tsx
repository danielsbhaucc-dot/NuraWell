import { createClient } from '../../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepEditor } from '../../../../components/admin/StepEditor';

export const dynamic = 'force-dynamic';

export default async function NewStepPage() {
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

  return <StepEditor step={null} />;
}
