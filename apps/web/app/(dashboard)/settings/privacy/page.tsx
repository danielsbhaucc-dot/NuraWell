import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PrivacySettingsClient } from '@/components/settings/PrivacySettingsClient';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'פרטיות ונתונים',
  description: 'ייצוא נתונים, מחיקת חשבון ומימוש זכויות פרטיות.',
  robots: { index: false, follow: false },
};

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/settings/privacy');

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <PrivacySettingsClient email={user.email ?? ''} />
    </Suspense>
  );
}
