import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ChallengeShell } from '@/components/challenge/ChallengeShell';
import { licenseGate, profileRole } from '@/lib/central/license-gate';
import { enforceParentSessionPage } from '@/lib/central/parent-data-plane';

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

  return <ChallengeShell user={user}>{children}</ChallengeShell>;
}
