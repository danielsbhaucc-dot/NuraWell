import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { CEO_NAME } from '@/lib/ceo/agent';
import { GideonSettingsPanel } from '@/components/admin/GideonSettingsPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות גדעון' };

export default async function GideonSettingsPage() {
  await ensureOpsAdminServer();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-black text-primary-900">הגדרות {CEO_NAME}</h1>
      <GideonSettingsPanel />
    </main>
  );
}
