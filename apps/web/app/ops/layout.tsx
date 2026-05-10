import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'פאנל ניהול',
  robots: { index: false, follow: false },
};

function firstNameFromFullName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  if (!t) return '';
  return t.split(/\s+/)[0] ?? '';
}

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  await ensureOpsAdminServer();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let adminFirstName = '';
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    adminFirstName = firstNameFromFullName(profile?.full_name as string | null);
  }

  return <AdminShell adminFirstName={adminFirstName}>{children}</AdminShell>;
}
