import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SecuritySettingsClient } from '@/components/settings/SecuritySettingsClient';

export const metadata: Metadata = {
  title: 'כניסה ואבטחה',
  description: 'כניסה עם Face ID או טביעת אצבע, וקודי גיבוי חד־פעמיים.',
  robots: { index: false, follow: false },
};

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/settings/security');
  return <SecuritySettingsClient />;
}
