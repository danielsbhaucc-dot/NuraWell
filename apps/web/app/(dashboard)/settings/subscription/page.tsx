import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { MySubscriptionClient } from '@/components/billing/MySubscriptionClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'המנוי שלי', robots: { index: false, follow: false } };

export default async function MySubscriptionPage() {
  if (!billingPlatformEnabled()) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings/subscription');
  return <MySubscriptionClient />;
}
