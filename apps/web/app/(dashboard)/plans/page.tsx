import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PlansClient } from '@/components/almog/PlansClient';

export const metadata = {
  title: 'התוכנית שלי | NuraWell',
};

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const firstName =
    String(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
      .trim()
      .split(/\s+/)[0] || '';

  return <PlansClient userId={user.id} firstName={firstName} />;
}
