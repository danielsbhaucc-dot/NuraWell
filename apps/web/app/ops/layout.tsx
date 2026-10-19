import type { Metadata } from 'next';
import { ensureOpsAdminServer, getOpsSessionContext } from '@/lib/auth/ensure-ops-admin-server';
import { AdminShell } from '@/components/admin/AdminShell';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';

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

  const { profile } = await getOpsSessionContext();
  // perf: env value (no DB round-trip on every Ops page) — only used for the "back to app" link.
  const mainAppBase = publicAppBaseNoSlashSync();
  const adminFirstName = firstNameFromFullName(profile?.full_name ?? null);
  const adminDisplayName = profile?.full_name?.trim() || 'מנהל';
  const adminAvatarUrl = profile?.avatar_url ?? null;

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
