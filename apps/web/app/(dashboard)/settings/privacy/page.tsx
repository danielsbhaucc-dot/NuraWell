import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrivacySettingsClient } from '@/components/settings/PrivacySettingsClient';

export const metadata: Metadata = {
  title: 'פרטיות ונתונים',
  description: 'ייצוא נתונים, מחיקת חשבון ומימוש זכויות פרטיות.',
  robots: { index: false, follow: false },
};

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/settings/privacy');

  return <PrivacySettingsClient email={user.email ?? ''} />;
}
