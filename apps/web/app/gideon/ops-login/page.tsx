import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStepupLink } from '@/lib/ceo/security';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'כניסה ללוח הבקרה', robots: { index: false, follow: false } };

/** Ops 2nd factor: logged-in admin → one-time passkey link (bound to this user) → back to `next`. */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (p?.role !== 'admin') redirect('/');
  const url = await createStepupLink(createAdminClient(), 'ops_login', { userId: user.id, next: next && next.startsWith('/') ? next : '/' });
  redirect(url);
}
