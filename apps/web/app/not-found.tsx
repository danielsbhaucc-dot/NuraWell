import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import NotFoundClient from '@/components/not-found/NotFoundClient';

export const metadata: Metadata = {
  title: 'העמוד לא נמצא',
  description: 'העמוד שחיפשת לא קיים או הועבר.',
  robots: { index: false, follow: false },
};

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
