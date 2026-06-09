import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { AdminShell } from '@/components/admin/AdminShell';
import { publicAppBaseNoSlashFromServer } from '@/lib/public-app-url';

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
  const mainAppBase = await publicAppBaseNoSlashFromServer(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let adminFirstName = '';
  let adminDisplayName = 'מנהל';
  let adminAvatarUrl: string | null = null;
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single();
    adminFirstName = firstNameFromFullName(profile?.full_name as string | null);
    const full = (profile?.full_name as string | null)?.trim();
    if (full) adminDisplayName = full;
    adminAvatarUrl = (profile?.avatar_url as string | null) ?? null;
  }

  return (
    <AdminShell
      adminFirstName={adminFirstName}
      adminDisplayName={adminDisplayName}
      adminAvatarUrl={adminAvatarUrl}
      mainAppBase={mainAppBase}
    >
      {children}
    </AdminShell>
  );
}
