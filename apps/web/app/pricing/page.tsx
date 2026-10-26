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
    <main dir="rtl" className="public-dark public-dark-bg min-h-dvh px-4 pb-28 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 pt-4 text-center">
          <span className="rounded-full border border-accent-300/40 bg-accent-300/10 px-4 py-1 text-xs font-bold tracking-wide text-accent-200">
            מסלולי הליווי של NuraWell
          </span>
          <h1 className="text-balance text-4xl font-black leading-tight text-on-dark md:text-5xl">
            בוחרים את הליווי <span className="bg-linear-to-l from-accent-200 to-accent-400 bg-clip-text text-transparent">שמתאים לך</span>
          </h1>
          <p className="max-w-xl text-on-dark-soft">אלמוג, מנטור אישי לשינוי הרגלים: תוכנית אישית שמתעדכנת, שיעורי וידאו ומעקב יזום.</p>
        </header>
        <PlansGrid signedIn={!!user} currentPlan={isPlanId(plan) ? plan : null} />
      </div>
    </main>
  );
}
