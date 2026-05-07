import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { MobileHeader } from '../../components/shared/MobileHeader';
import { BottomNav } from '../../components/shared/BottomNav';
import { AIChatWidget } from '../../components/ai/AIChatWidget';

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
      <AIChatWidget userId={user.id} />
    </div>
  );
}
