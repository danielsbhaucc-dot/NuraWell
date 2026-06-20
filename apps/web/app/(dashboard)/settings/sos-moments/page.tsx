import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SosMomentsClient } from '../../../../components/settings/SosMomentsClient';
import { createClient } from '../../../../lib/supabase/server';

export const metadata: Metadata = {
  title: 'רגעים קשים — היסטוריה',
  description: 'היסטוריית רגעי SOS ומה עזר לך לאחרונה.',
};

export default async function SosMomentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <SosMomentsClient />;
}
