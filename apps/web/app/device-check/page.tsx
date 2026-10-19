import { DeviceCheckClient } from '@/components/ops-access/DeviceCheckClient';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אימות מכשיר', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdminPageOr404();
  const { e } = await searchParams;
  return <DeviceCheckClient initialError={e ? String(e).slice(0, 200) : null} />;
}
