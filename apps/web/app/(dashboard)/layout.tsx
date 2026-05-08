import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MobileHeader } from '../../components/shared/MobileHeader';
import { BottomNav } from '../../components/shared/BottomNav';

const AIOverlaysClient = dynamic(
  () => import('../../components/ai/AIOverlaysClient').then((m) => m.AIOverlaysClient),
  { ssr: false }
);

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
      <main className="pb-24 pt-16 min-h-screen page-enter">
        {children}
      </main>
      <BottomNav />
      <AIOverlaysClient userId={user.id} />
    </div>
  );
}
