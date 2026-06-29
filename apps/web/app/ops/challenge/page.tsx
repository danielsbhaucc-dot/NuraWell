import { AdminChallengePageHeader, AdminChallengePanel } from '@/components/admin/AdminChallengePanel';

export const dynamic = 'force-dynamic';

export default function OpsChallengePage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <AdminChallengePageHeader />
      <AdminChallengePanel />
    </div>
  );
}
