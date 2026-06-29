import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';
import { ChallengeEatingWindowClient } from '@/components/challenge/ChallengeEatingWindowClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'חלון אכילה — NuraWell',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

export default async function ChallengeEatingWindowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge/eating-window');

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'waiting') redirect('/challenge');
  if (phase === 'intro') redirect('/challenge/intro');
  if (phase === 'interview') redirect('/challenge/interview');
  if (phase === 'active' && enrollment.eating_window && enrollment.interview_completed_at) {
    redirect('/challenge/dashboard');
  }

  return <ChallengeEatingWindowClient />;
}
