import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminUsersClient } from '@/components/admin/AdminUsersClient';

export default function OpsUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
        </div>
      }
    >
      <AdminUsersClient />
    </Suspense>
  );
}
