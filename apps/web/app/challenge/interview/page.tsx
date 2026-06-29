import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';
import { ChallengeInterviewGlass } from '@/components/challenge/ChallengeInterviewGlass';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ריאיון עם אלמוג — NuraWell',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

export default async function ChallengeInterviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge/interview');

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'waiting') redirect('/challenge');
  if (phase === 'intro') redirect('/challenge/intro');
  if (phase === 'eating_window_setup') redirect('/challenge/eating-window');
  if (phase === 'active') redirect('/challenge/dashboard');
  if (phase === 'wrap_up' || phase === 'completed') redirect(challengeRouteForPhase(phase));

  return <ChallengeInterviewGlass />;
}
