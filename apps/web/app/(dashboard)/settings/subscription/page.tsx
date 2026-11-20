import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { MySubscriptionClient } from '@/components/billing/MySubscriptionClient';
import { ParentSubscriptionView } from '@/components/billing/ParentSubscriptionView';
import { loadMySubscription } from '@/lib/central/my-subscription-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'המנוי שלי', robots: { index: false, follow: false } };

export default async function MySubscriptionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/settings/subscription');
  // Local billing platform (dark in production) keeps its own screen; otherwise the parent account owns billing.
  if (billingPlatformEnabled()) return <MySubscriptionClient />;
  return <ParentSubscriptionView view={await loadMySubscription(user)} />;
}
