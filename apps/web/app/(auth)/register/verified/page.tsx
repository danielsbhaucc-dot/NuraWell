import { RegisterVerifiedClient } from '@/components/onboarding/RegisterVerifiedClient';
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
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('gender')
      .eq('id', user.id)
      .maybeSingle();

    gender = (profile?.gender as OnboardingGender) ?? '';
  }

  return <RegisterVerifiedClient gender={gender} />;
}
