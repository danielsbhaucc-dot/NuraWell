import { notFound } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { AdminBillingPanel } from '@/components/billing/AdminBillingPanel';

export const dynamic = 'force-dynamic';

export default async function OpsBillingPage() {
  await requireAdminPageOr404();
  if (!billingPlatformEnabled()) notFound();
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader icon={CreditCard} eyebrow="חיוב" title="מנויים ותשלומים" tone="emerald"
        description="מצב המנויים, הכנסה חודשית חוזרת, חיובים שנכשלו ושינוי ידני של מנוי (דורש אימות נוסף)." />
      <AdminBillingPanel />
    </div>
  );
}
