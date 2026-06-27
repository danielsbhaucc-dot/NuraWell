import type { Metadata } from 'next';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { StepLesson } from '../../../../components/journey/StepLesson';
import type { JourneyStep, JourneyStepProgress } from '../../../../lib/types/journey';
import type { LessonAudioTrack } from '../../../../lib/types/audio';
import { getPublicCdnAudioUrl } from '../../../../lib/cdn/public-audio';
import { isJourneyStepNumber, isJourneyStepUuid } from '../../../../lib/journey/resolve-step';
import { buildAdminUserJourneyReport } from '../../../../lib/admin/build-user-journey-report';
import {
  canAccessJourneyStep,
  loadJourneyAccessContext,
} from '../../../../lib/journey/journey-access';

export const dynamic = 'force-dynamic';

const JOURNEY_PROGRESS_SELECT =
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, is_completed, completed_at, last_section';

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

async function fetchJourneyStepTitleByParam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  param: string
): Promise<string | null> {
  if (isJourneyStepUuid(param)) {
    const { data } = await supabase
      .from('journey_steps')
      .select('title')
      .eq('id', param)
      .single();
    return typeof data?.title === 'string' ? data.title : null;
  }
  if (isJourneyStepNumber(param)) {
    const n = parseInt(param, 10);
    const { data: rows } = await supabase
      .from('journey_steps')
      .select('title')
      .eq('step_number', n)
      .eq('is_published', true)
      .order('created_at', { ascending: true })
      .limit(1);
    const row = rows?.[0];
    return typeof row?.title === 'string' ? row.title : null;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ stepId: string }> }): Promise<Metadata> {
  const { stepId } = await params;
  const supabase = await createClient();
  const title = await fetchJourneyStepTitleByParam(supabase, stepId);
  return { title: title || 'שיעור' };
}

export default async function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const step = await fetchJourneyStepByParam(supabase, stepId);

  if (!step) notFound();

  if (!step.is_published) notFound();

  const resolvedStepId = step.id;

  // מגדר המשתמש — לנוסח התחייבות מותאם ("אני מתחייב/מתחייבת")
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', user.id)
    .maybeSingle();
  const userGender: 'male' | 'female' | null =
    profileRow?.gender === 'male' || profileRow?.gender === 'female' ? profileRow.gender : null;

  const { data: progress } = await supabase
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
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
    task_statuses: {},
    habits_progress: {},
    is_completed: false,
    completed_at: null,
    last_section: 'video',
  };

  const admin = createAdminClient();
  const report = await buildAdminUserJourneyReport(admin, user.id);
  const accessCtx = await loadJourneyAccessContext(supabase, user.id, report);
  const allowed = canAccessJourneyStep({
    ctx: accessCtx,
    stepId: resolvedStepId,
    stationId: step.station_id,
    isPublished: step.is_published,
    isCompleted: Boolean(initialProgress.is_completed),
    started: Boolean(progress),
  });
  if (!allowed) redirect('/journey');

  let audioTracks: LessonAudioTrack[] = [];
  if (step.audio_playlist_id) {
    // RLS מחזיר רצועות רק אם הפלייליסט מפורסם (אחרת — אין מוזיקה, וזה תקין).
    const { data: trackRows } = await supabase
      .from('audio_tracks')
      .select('id, title, object_key, credit')
      .eq('playlist_id', step.audio_playlist_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (Array.isArray(trackRows)) {
      audioTracks = trackRows
        .map((t: { id: string; object_key?: string | null; title?: string; credit?: string | null }) => {
          const url = t.object_key ? getPublicCdnAudioUrl(t.object_key) : null;
          return url
            ? {
                id: t.id as string,
                title: (t.title as string) ?? '',
                url,
                credit: t.credit ?? { source: '', author: '' },
              }
            : null;
        })
        .filter((x): x is LessonAudioTrack => x !== null);
    }
  }

  return (
    <StepLesson
      step={step as JourneyStep}
      initialProgress={initialProgress}
      userId={user.id}
      userGender={userGender}
      audioTracks={audioTracks}
    />
  );
}
