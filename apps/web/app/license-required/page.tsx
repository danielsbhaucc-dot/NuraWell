import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LicenseRequired from '@/components/license/LicenseRequired';
import { licenseGate, profileRole, purchaseUrl } from '@/lib/central/license-gate';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'נדרש רישיון פעיל', robots: { index: false, follow: false } };

async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Reachable only by an identity the gate blocks right now; everyone else goes back to the app. */
export default async function LicenseRequiredPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const gate = await licenseGate(user, await profileRole(user.id));
  if (!gate.block) redirect('/home');
  return <LicenseRequired purchaseHref={purchaseUrl()} signOut={signOut} />;
}
