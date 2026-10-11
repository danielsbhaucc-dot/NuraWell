import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEntitlements } from '@/lib/billing/entitlements';
import { getBillingProvider } from '@/lib/billing/provider';
import { TIERS } from '@/lib/billing/tiers';
import { UpgradeClient } from '@/components/billing/UpgradeClient';

export const metadata = { title: 'מסלולים' };
export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  station: 'התחנה הזאת היא חלק מהמסע המלא.',
  guides: 'ספריית המדריכים פתוחה במסלול פרימיום.',
  chat: 'הגעת למכסת ההודעות היומית במסלול החינמי.',
};

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ reason?: string; status?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const sp = await searchParams;
  const e = await getEntitlements(createAdminClient(), user.id);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-28 pt-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-primary-900">המסלול שלך</h1>
        {sp.reason && REASONS[sp.reason] ? <p className="text-sm text-primary-800/80">{REASONS[sp.reason]}</p> : null}
      </header>
      <UpgradeClient
        tiers={Object.values(TIERS)}
        current={{ tier: e.tier, source: e.source, trialUsed: e.trialUsed, trialEndsAt: e.subscription?.trial_ends_at ?? null, periodEnd: e.subscription?.current_period_end ?? null }}
        providerConfigured={getBillingProvider().configured}
        status={sp.status ?? null}
      />
    </main>
  );
}
