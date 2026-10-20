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
      <OpsPageHeader icon={Scale} eyebrow="משפטי" title="מרכז זכויות וראיות" tone="emerald"
        description="מדיה, קבלות, הסכמות ותיקי ראיות במקום אחד. רק מה שצריך אותך מופיע למעלה." />
      <LegalTabs initialTab={(['overview', 'media', 'receipts', 'consent', 'evidence', 'keys'] as const).find((t) => t === tab) ?? 'overview'} />
    </div>
  );
}
