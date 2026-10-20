import { Scale } from 'lucide-react';
import { AdminLegalPanel } from '@/components/admin/AdminLegalPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';

export const dynamic = 'force-dynamic';

export default async function OpsLegalPage() {
  await requireAdminPageOr404();
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader icon={Scale} eyebrow="משפטי" title="תיעוד הסכמות וראיות" tone="emerald"
        description="כל אישור וביטול של הסכמה, עם צילום החלון, חתימה וחותמת זמן. אפשר לאמת שלמות ולהפיק תיק ראיות מוכן לבית משפט." />
      <AdminLegalPanel />
    </div>
  );
}
