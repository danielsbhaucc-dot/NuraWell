import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { CEO_NAME } from '@/lib/ceo/agent';
import { GideonSettingsPanel } from '@/components/admin/GideonSettingsPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות גדעון' };

export default async function GideonSettingsPage() {
  await ensureOpsAdminServer();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="px-1 font-display text-[1.75rem] font-black leading-tight tracking-tight text-ink">הגדרות {CEO_NAME}</h1>
      <GideonSettingsPanel />
    </div>
  );
}
