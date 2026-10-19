import { BridgeClient } from '@/components/ops-access/BridgeClient';
import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function Page() {
  await requireAdminPageOr404();
  return <BridgeClient />;
}
