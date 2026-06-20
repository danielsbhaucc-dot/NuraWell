import { Accessibility } from 'lucide-react';
import { AdminAccessibilityPanel } from '@/components/admin/AdminAccessibilityPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

export const dynamic = 'force-dynamic';

export default function OpsAccessibilityPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={Accessibility}
        eyebrow="נגישות"
        title="כלי נגישות"
        tone="emerald"
        description="ביקורת alt במדיה, יצירה אוטומטית בעברית, ומעקב אחר פערי נגישות בתוכן."
      />
      <AdminAccessibilityPanel />
    </div>
  );
}
