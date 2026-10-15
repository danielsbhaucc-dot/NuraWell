import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { GideonSecurityPanel } from '@/components/gideon/GideonSecurityPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון · אבטחה' };

export default async function Page() {
  await ensureOpsAdminServer();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">גדעון · אבטחה</h1>
      <p className="text-sm text-slate-600">אישורים רגילים: הקשה אחת בטלגרם. פעולות רגישות (מחיקות, הרשאות, פעולות גורפות, הפעלה מחדש): Face ID.</p>
      <GideonSecurityPanel />
    </div>
  );
}
