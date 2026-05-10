import type { Metadata } from 'next';
import { ensureAdminServer } from '../../lib/auth/ensure-admin-server';
import { AdminShell } from '../../components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'פאנל ניהול | NuraWell',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminServer();

  return <AdminShell>{children}</AdminShell>;
}
