import { createClient } from '@/lib/supabase/server';
import NotFoundClient from '@/components/not-found/NotFoundClient';

export default async function NotFoundPage() {
  let isAuthenticated = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  } catch {
    isAuthenticated = false;
  }

  return <NotFoundClient isAuthenticated={isAuthenticated} />;
}
