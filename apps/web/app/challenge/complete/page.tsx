import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { resolveChallengePhase } from '@/lib/challenge/phase';
import { buildChallengeCompletionSummary, finalizeChallengeIfEnded } from '@/lib/challenge/completion-summary';
import { firstNameFromFullName } from '@/lib/challenge/gender-copy';
import { ChallengeCompleteClient } from '@/components/challenge/ChallengeCompleteClient';
import type { ChallengeCompletionSummary } from '@/lib/challenge/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'סיום האתגר — NuraWell',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

export default async function ChallengeCompletePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge/complete');

  let enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const firstName = firstNameFromFullName(profile?.full_name as string | null);

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'waiting' || phase === 'intro' || phase === 'interview' || phase === 'eating_window_setup') {
    redirect('/challenge/dashboard');
  }

  let summary = enrollment.completion_summary as ChallengeCompletionSummary | null;

  if (phase === 'wrap_up' && !summary) {
    const admin = createAdminClient();
    const { summary: generated } = await finalizeChallengeIfEnded(admin, enrollment, firstName);
    summary = generated ?? null;
    enrollment = (await getUserEnrollment(supabase, user.id)) ?? enrollment;
  }

  if (!summary && enrollment.completion_summary) {
    summary = enrollment.completion_summary as ChallengeCompletionSummary;
  }

  if (!summary) {
    const admin = createAdminClient();
    summary = await buildChallengeCompletionSummary(admin, enrollment, firstName);
  }

  return <ChallengeCompleteClient firstName={firstName} initialSummary={summary} />;
}
