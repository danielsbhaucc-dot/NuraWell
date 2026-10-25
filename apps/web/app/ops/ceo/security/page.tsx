import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { GideonSecurityPanel } from '@/components/gideon/GideonSecurityPanel';
import { OpsDevicesPanel } from '@/components/ops-access/OpsDevicesPanel';
import { SecurityKeysPanel } from '@/components/ops-access/SecurityKeysPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון · אבטחה' };

export default async function Page() {
  await ensureOpsAdminServer();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">גדעון · אבטחה</h1>
      <p className="text-sm text-ink-soft">אישורים רגילים: הקשה אחת בטלגרם. פעולות רגישות (מחיקות, הרשאות, פעולות גורפות, הפעלה מחדש): Face ID בתוך טלגרם בלבד.</p>
      <SecurityKeysPanel />
      <OpsDevicesPanel />
      <GideonSecurityPanel />
    </div>
  );
}
