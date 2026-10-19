import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { LogsShell } from '@/components/ops-logs/LogsShell';
import { ActivityLog } from '@/components/ops-logs/ActivityLog';
import { ErrorLog } from '@/components/ops-logs/ErrorLog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'יומנים' };

/** Admin: activity log (security + deliveries) and grouped error log. Data loads via the admin-only API. */
export default async function OpsLogsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureOpsAdminServer();
  const tab = (await searchParams).tab === 'activity' ? 'activity' : 'errors';
  return <LogsShell tab={tab}>{tab === 'activity' ? <ActivityLog /> : <ErrorLog />}</LogsShell>;
}
