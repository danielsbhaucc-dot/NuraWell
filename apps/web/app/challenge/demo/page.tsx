import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { verifyChallengeDemoToken } from '@/lib/challenge/demo-token';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ t?: string }>;
};

/**
 * כניסת דemo — רק מנהל מחובר + טoken חתום.
 * משתמשים רגילים מקבלים 404.
 */
export default async function ChallengeDemoPage({ searchParams }: Props) {
  const { t: token } = await searchParams;

  if (!token) {
    redirect('/home');
  }

  const payload = verifyChallengeDemoToken(token);
  if (!payload) {
    redirect('/home');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/challenge/demo?t=${encodeURIComponent(token)}`)}`);
  }

  if (user.id !== payload.adminId) {
    redirect('/home');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/home');
  }

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment?.is_demo) {
    redirect('/home');
  }

  const phase = resolveChallengePhase(enrollment);
  redirect(challengeRouteForPhase(phase));
}
