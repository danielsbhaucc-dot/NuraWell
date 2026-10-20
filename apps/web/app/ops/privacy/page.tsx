import { ShieldCheck } from 'lucide-react';
import { AdminPrivacyCompliancePanel } from '@/components/admin/AdminPrivacyCompliancePanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';

export const dynamic = 'force-dynamic';

export default async function OpsPrivacyPage() {
  await requireAdminPageOr404();
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader icon={ShieldCheck} eyebrow="פרטיות" title="ציות להגנת הפרטיות" tone="emerald"
        description="מה נשאר לך לעשות כדי לעמוד בחוק ובתקנות אבטחת המידע, עם הסבר קצר לכל סעיף והמסמכים במקום אחד." />
      <AdminPrivacyCompliancePanel />
    </div>
  );
}
