import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';

/** לאימות צד-שרת לנתיבי `/admin/*` (בנוסף ל-middleware). */
export async function ensureAdminServer(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/courses');
}
