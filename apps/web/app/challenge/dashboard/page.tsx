import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildChallengeState, getUserEnrollment } from '@/lib/challenge/enrollment';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';
import { ChallengeDashboardClient } from '@/components/challenge/ChallengeDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'אתגר 14 יום — NuraWell',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

export default async function ChallengeDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge/dashboard');

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'waiting') redirect('/challenge');
  if (phase === 'intro') redirect('/challenge/intro');
  if (phase === 'eating_window_setup') redirect('/challenge/eating-window');
  if (phase === 'interview') redirect('/challenge/interview');
  if (phase === 'wrap_up') redirect('/challenge/complete');
  if (phase === 'completed') redirect('/home');

  const state = buildChallengeState(enrollment);
  return <ChallengeDashboardClient initialState={state} />;
}
