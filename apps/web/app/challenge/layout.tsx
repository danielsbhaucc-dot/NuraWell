import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ChallengeShell } from '@/components/challenge/ChallengeShell';
import { licenseGate, profileRole } from '@/lib/central/license-gate';
import { enforceParentSessionPage } from '@/lib/central/parent-data-plane';
import { PolicyReacceptGate } from '@/lib/module-api/legal/components-legal-PolicyReacceptGate';
import { needsPolicyReaccept } from '@/lib/module-api/legal/lib-legal-policy-reaccept';
import { LEGAL_POLICY_VERSION } from '@/lib/module-api/privacy-retention/lib-privacy-constants';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

// skipcq: JS-0067 -- Next.js layout default export, not a global
export default async function ChallengeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/challenge');
  }

  await enforceParentSessionPage(user);

  // Same parent-license gate as the dashboard layout (off unless armed by env AND the DB kill switch; admins never blocked; fail-open).
  if (process.env.PLATFORM_LICENSE_MODE === 'enforce') {
    const gate = await licenseGate(user, await profileRole(user.id));
    if (gate.block) redirect('/license-required');
  }

  const { data: policy } = await supabase
    .from('profiles')
    .select('onboarding_completed, accepted_policy_version')
    .eq('id', user.id)
    .maybeSingle();
  const showPolicyReaccept = needsPolicyReaccept(policy);

  return (
    <ChallengeShell user={user}>
      {showPolicyReaccept ? <PolicyReacceptGate show version={LEGAL_POLICY_VERSION} /> : null}
      {children}
    </ChallengeShell>
  );
}
