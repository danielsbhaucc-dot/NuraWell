import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SosMomentsClient } from '../../../../components/settings/SosMomentsClient';
import { firstNameFromFull } from '../../../../lib/onboarding/profile-summary-rows';
import type { OnboardingGender } from '../../../../lib/onboarding/types';
import { createClient } from '../../../../lib/supabase/server';

export const metadata: Metadata = {
  title: 'הרגעים שלך',
  description: 'מה עזר לך ברגעים קשים — זיכרון משותף עם אלמוג.',
};

export default async function SosMomentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, gender')
    .eq('id', user.id)
    .maybeSingle();

  const firstName = firstNameFromFull(profile?.full_name ?? null) || 'חבר/ה';
  const gender = (profile?.gender as OnboardingGender | null) ?? null;

  return <SosMomentsClient firstName={firstName} gender={gender} />;
}
