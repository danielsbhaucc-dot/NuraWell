import { PiiJustificationHost } from '@/components/ops/access/PiiJustificationHost';
import { StepUpEventHost } from '@/components/admin/useStepUpRetry';
import type { Metadata } from 'next';
import { ensureOpsAdminServer, getOpsSessionContext } from '@/lib/auth/ensure-ops-admin-server';
import { AdminShell } from '@/components/admin/AdminShell';
import { OpsPendingLoginAlert } from '@/components/ops-access/OpsDevicesPanel';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';
import { ForcePasswordRotation } from '@/components/ops-access/ForcePasswordRotation';
import { passwordRotationRequired } from '@/lib/ops/password-rotation';
import { createAdminClient } from '@/lib/supabase/admin';
import { opsNavState } from '@/lib/platform/nav-state';

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

  const { profile, user } = await getOpsSessionContext();
  // Break-glass: nothing in Ops renders until a new password is set (the API gate enforces the same).
  if (user && (await passwordRotationRequired(createAdminClient(), user.id))) {
    return <ForcePasswordRotation />;
  }
  // perf: env value (no DB round-trip on every Ops page) — only used for the "back to app" link.
  const mainAppBase = publicAppBaseNoSlashSync();
  const adminFirstName = firstNameFromFullName(profile?.full_name ?? null);
  const adminDisplayName = profile?.full_name?.trim() || 'מנהל';
  const adminAvatarUrl = profile?.avatar_url ?? null;
  const nav = await opsNavState();

  return (
    <AdminShell
      adminFirstName={adminFirstName}
      adminDisplayName={adminDisplayName}
      adminAvatarUrl={adminAvatarUrl}
      mainAppBase={mainAppBase}
      hiddenPaths={nav.hiddenPaths}
      licenseAlert={nav.licenseAlert}
    >
      {children}
      <OpsPendingLoginAlert />
      <PiiJustificationHost />
      <StepUpEventHost />
    </AdminShell>
  );
}
