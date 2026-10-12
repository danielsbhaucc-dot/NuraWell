import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PlansGrid } from '@/components/billing/PlansGrid';
import { isPlanId } from '@/lib/billing/plans';

export const metadata: Metadata = { title: 'מסלולים ומחירים', description: 'מסלולי המנוי של NuraWell' };
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let plan: string | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    plan = (data as { plan?: string } | null)?.plan ?? 'basic';
  }
  return (
    <main dir="rtl" className="min-h-dvh bg-[#f8f5ec] px-4 pb-28 pt-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-black text-[#14532d]">בוחרים את הליווי שמתאים לך</h1>
          <p className="max-w-xl text-[#14532d]/80">אלמוג, מנטור אישי לשינוי הרגלים: תוכנית אישית שמתעדכנת, שיעורי וידאו ומעקב יזום.</p>
        </header>
        <PlansGrid signedIn={!!user} currentPlan={isPlanId(plan) ? plan : null} />
      </div>
    </main>
  );
}
