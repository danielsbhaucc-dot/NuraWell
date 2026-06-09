import { RegisterVerifiedClient } from '@/components/onboarding/RegisterVerifiedClient';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';
import { createClient } from '@/lib/supabase/server';
import type { OnboardingGender } from '@/lib/onboarding/types';

export const metadata = {
  title: 'האימייל אומת | NuraWell',
};

export default async function RegisterVerifiedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let gender: OnboardingGender | '' = '';

  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await supabase
      .from('profiles')
      .select('gender')
      .eq('id', user.id)
      .maybeSingle();

    const profileRow = profile as { gender?: OnboardingGender | null } | null;
    gender = profileRow?.gender ?? '';
  }

  return (
    <>
      <RegisterVerifiedClient gender={gender} />
      <div className="fixed inset-x-0 bottom-6 z-20 px-4">
        <PublicAiPresence compact />
      </div>
    </>
  );
}
