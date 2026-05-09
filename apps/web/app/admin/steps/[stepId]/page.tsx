import { createClient } from '../../../../lib/supabase/server';
import { notFound } from 'next/navigation';
import { StepEditor } from '../../../../components/admin/StepEditor';
import type { JourneyStep } from '../../../../lib/types/journey';

export const dynamic = 'force-dynamic';

export default async function EditStepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: step } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .eq('id', stepId)
    .single();

  if (!step) notFound();

  return <StepEditor step={step as JourneyStep} />;
}
