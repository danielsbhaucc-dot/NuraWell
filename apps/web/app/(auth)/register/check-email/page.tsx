import { CheckEmailClient } from '@/components/onboarding/CheckEmailClient';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';
import { createClient } from '@/lib/supabase/server';
import { firstNameFromFull } from '@/lib/onboarding/profile-summary-rows';
import type { OnboardingGender } from '@/lib/onboarding/types';

export const metadata = {
  title: 'אימות אימייל | NuraWell',
};

export default async function RegisterCheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp.error === 'auth';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let email = sp.email?.trim() ?? user?.email ?? '';

  let firstName = '';
  let gender: OnboardingGender | '' = '';

  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name, gender')
      .eq('id', user.id)
      .maybeSingle();

    firstName = firstNameFromFull(profile?.full_name ?? null);
    gender = (profile?.gender as OnboardingGender) ?? '';
  }

  return (
    <main
      id="main-content"
      className="onboarding-shell-dark min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
    >
      <CheckEmailClient
        email={email}
        hasAuthError={hasError}
        firstName={firstName}
        gender={gender}
      />
      <div className="mt-5 w-full px-2">
        <PublicAiPresence compact />
      </div>
    </main>
  );
}
