import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { MobileHeader } from '../../components/shared/MobileHeader';
import { BottomNav } from '../../components/shared/BottomNav';
import { AIOverlaysClient } from '../../components/ai/AIOverlaysClient';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-dashboard">
      <MobileHeader user={user} />
      <main id="main-content" className="pb-24 pt-16 min-h-screen page-enter" tabIndex={-1}>
        {children}
      </main>
      <BottomNav />
      <AIOverlaysClient userId={user.id} />
    </div>
  );
}
