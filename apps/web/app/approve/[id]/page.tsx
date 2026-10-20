import { StepUpApprove } from '@/components/admin/StepUpApprove';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אישור מהטלפון', robots: { index: false } };

/** Phone side of QR approval for users (step-up + QR sign-in). Auth is enforced by /api/v1/stepup/approve. */
export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StepUpApprove id={id} />;
}
