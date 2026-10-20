import { requireAdminPageOr404 } from '@/lib/ops/require-admin-page';
import { StepUpApprove } from '@/components/admin/StepUpApprove';

export const dynamic = 'force-dynamic';

/** Phone side of the QR step-up. Admin-only + approved Ops device (404 otherwise). */
export default async function OpsApprovePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPageOr404();
  const { id } = await params;
  return <StepUpApprove id={id} />;
}
