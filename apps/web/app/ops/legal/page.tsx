import { Scale } from 'lucide-react';
import { LegalTabs } from '@/components/admin/LegalTabs';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';

export const dynamic = 'force-dynamic';

export default async function OpsLegalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  await requireAdminPageOr404();
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader icon={Scale} eyebrow="משפטי" title="הסכמות, מקורות מדיה וראיות" tone="emerald"
        description="כל אישור וביטול של הסכמה, ומקור וזכויות של כל קובץ באתר. הכול חתום ועם חותמת זמן, ואפשר להפיק תיק ראיות מוכן לבית משפט." />
      <LegalTabs initialTab={tab === 'media' ? 'media' : 'consent'} />
    </div>
  );
}
