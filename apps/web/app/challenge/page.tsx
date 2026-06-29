import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildChallengeState, getUserEnrollment } from '@/lib/challenge/enrollment';
import { firstNameFromFullName } from '@/lib/challenge/gender-copy';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';
import { ChallengeWaitingExperience } from '@/components/challenge/ChallengeWaitingExperience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'האתגר מתחיל — NuraWell',
  description: 'ספירה לאחור לתחילת אתגר 14 הימים',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

export default async function ChallengeWaitingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge');

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const state = buildChallengeState(enrollment);
  const phase = resolveChallengePhase(enrollment);
  if (phase !== 'waiting') {
    redirect(challengeRouteForPhase(phase));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, gender')
    .eq('id', user.id)
    .single();

  return (
    <ChallengeWaitingExperience
      firstName={firstNameFromFullName(profile?.full_name as string | null)}
      gender={(profile?.gender as string | null) ?? null}
      initialState={state}
    />
  );
}
