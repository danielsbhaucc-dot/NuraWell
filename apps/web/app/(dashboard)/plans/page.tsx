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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  // שם פרטי אמיתי בלבד — לא נגזור שם-משתמש מהאימייל. אם אין שם, פנייה כללית חמה.
  const fullName = (profile?.full_name ?? user.user_metadata?.full_name ?? '') as string;
  const firstName = fullName.trim().split(/\s+/)[0] || '';

  return <PlansClient userId={user.id} firstName={firstName} />;
}
