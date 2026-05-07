import type { Metadata } from 'next';
import { createClient } from '../../../../lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { StepLesson } from '../../../../components/journey/StepLesson';
import type { JourneyStep, JourneyStepProgress } from '../../../../lib/types/journey';
import { isJourneyStepNumber, isJourneyStepUuid } from '../../../../lib/journey/resolve-step';

export const dynamic = 'force-dynamic';

async function fetchJourneyStepByParam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  param: string
): Promise<JourneyStep | null> {
  if (isJourneyStepUuid(param)) {
    const { data } = await supabase
      .from('journey_steps')
      .select('*')
      .eq('id', param)
      .single();
    return data as JourneyStep | null;
  }
  if (isJourneyStepNumber(param)) {
    const n = parseInt(param, 10);
    const { data: rows } = await supabase
      .from('journey_steps')
      .select('*')
      .eq('step_number', n)
      .eq('is_published', true)
      .order('created_at', { ascending: true })
      .limit(1);
    const row = rows?.[0];
    return row ? (row as JourneyStep) : null;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ stepId: string }> }): Promise<Metadata> {
  const { stepId } = await params;
  const supabase = await createClient();
  const step = await fetchJourneyStepByParam(supabase, stepId);
  return { title: step?.title || 'שיעור' };
}

export default async function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const step = await fetchJourneyStepByParam(supabase, stepId);

  if (!step) notFound();

  const resolvedStepId = step.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progress } = await (supabase as any)
    .from('journey_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('step_id', resolvedStepId)
    .single();

  const initialProgress: JourneyStepProgress = progress || {
    step_id: resolvedStepId,
    user_id: user.id,
    video_watched: false,
    quiz_answers: {},
    quiz_score: null,
    game_answers: {},
    game_score: null,
    commitment_accepted: false,
    tasks_completed: {},
    habits_progress: {},
    is_completed: false,
    completed_at: null,
    last_section: 'video',
  };

  return <StepLesson step={step as JourneyStep} initialProgress={initialProgress} userId={user.id} />;
}
