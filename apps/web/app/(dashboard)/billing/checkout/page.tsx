import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { CheckoutClient } from '@/components/billing/CheckoutClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'בחירת מסלול', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  if (!billingPlatformEnabled()) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/billing/checkout');
  return <CheckoutClient />;
}
