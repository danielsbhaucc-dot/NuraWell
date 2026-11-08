import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingFormClient } from '@/components/onboarding/OnboardingFormClient';
import { PROVISION_COOKIE, unpackProvision } from '@/lib/central/parent-provision';
import { accessClosed, centralAuthOn, signinMode } from '@/lib/central/parent-signin';

export const metadata: Metadata = {
  title: 'שאלון הרשמה',
  description: 'שאלון קצר להכרות עם המנטור האישי דולב ב-NuraWell',
  robots: { index: false, follow: false },
};

export default async function RegisterFormPage() {
  const mode = await signinMode();
  if (accessClosed(mode)) {
    if (!centralAuthOn(mode)) redirect('/login?e=parent_unavailable');
    const proof = unpackProvision((await cookies()).get(PROVISION_COOKIE)?.value, process.env.PLATFORM_ID_CLIENT_SECRET ?? '');
    if (!proof) redirect('/api/v1/central/signin?intent=signup');
  }
  return <OnboardingFormClient />;
}
