import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveDemoAccessSession } from '@/lib/demo-access/active-session';

/** Main-site pages that exist only for admins: everyone else gets the generic 404. */
export async function requireAdminPageOr404(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await hasActiveDemoAccessSession(user.id))) notFound();
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== 'admin') notFound();
  return user.id;
}
