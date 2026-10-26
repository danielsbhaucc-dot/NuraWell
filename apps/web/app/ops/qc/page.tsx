import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { QcScreen } from '@/components/ops-qc/QcScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'בקרת איכות' };

export default async function OpsQcPage() {
  await ensureOpsAdminServer();
  return <QcScreen />;
}
