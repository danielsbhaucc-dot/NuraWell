import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { ScheduleSettingsClient } from '../../../../components/settings/ScheduleSettingsClient';
import { firstNameFromFull } from '../../../../lib/onboarding/profile-summary-rows';

export const metadata: Metadata = {
  title: 'לוח זמנים',
  description: 'הגדרת זמני יום מותאמים אישית — בוקר, ארוחות וערב',
};

export default async function ScheduleSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const fullName =
    (profile?.full_name as string | null)?.trim() ||
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
    'משתמש';
  const firstName = firstNameFromFull(fullName) || 'משתמש';

  return <ScheduleSettingsClient firstName={firstName} />;
}
