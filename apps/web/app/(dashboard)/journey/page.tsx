import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { JourneyPage } from '../../../components/journey/JourneyPage';
import type { JourneyStep, JourneyStepProgress } from '../../../lib/types/journey';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המסע שלי',
  description: 'המסע שלך לבריאות טובה יותר — שלב אחר שלב',
};

export default async function JourneyRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawSteps } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .eq('is_published', true)
    .order('step_number');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProgress } = await (supabase as any)
    .from('journey_progress')
    .select('*')
    .eq('user_id', user.id);

  const steps = (rawSteps as JourneyStep[]) || [];
  const progressList = (rawProgress as JourneyStepProgress[]) || [];
  const progressMap = new Map(progressList.map(p => [p.step_id, p]));

  const stepsWithProgress = steps.map(step => ({
    ...step,
    progress: progressMap.get(step.id) || null,
  }));

  return <JourneyPage steps={stepsWithProgress} />;
}
