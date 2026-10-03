import { redirect } from 'next/navigation';
import { RegisterVerifiedClient } from '@/components/onboarding/RegisterVerifiedClient';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';
import { createClient } from '@/lib/supabase/server';
import type { OnboardingGender } from '@/lib/onboarding/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'האימייל אומת',
  robots: { index: false, follow: false },
};

export default async function RegisterVerifiedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // M12: אל תציג "אומת בהצלחה" למי שבא בלי סשן פעיל אחרי callback.
  if (!user) {
    redirect('/login?redirect=/register/verified');
  }

  let gender: OnboardingGender | '' = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await supabase
    .from('profiles')
    .select('gender')
    .eq('id', user.id)
    .maybeSingle();

  const profileRow = profile as { gender?: OnboardingGender | null } | null;
  gender = profileRow?.gender ?? '';

  return (
    <>
      <RegisterVerifiedClient gender={gender} />
      <div className="fixed inset-x-0 bottom-6 z-20 px-4">
        <PublicAiPresence compact />
      </div>
    </>
  );
}
