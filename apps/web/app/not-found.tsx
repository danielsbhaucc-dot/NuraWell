import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import NotFoundClient from '@/components/not-found/NotFoundClient';
import { isOpsHostname, isOpsPreviewHostname } from '@/lib/ops-host';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';

export const metadata: Metadata = {
  title: 'העמוד לא נמצא',
  description: 'העמוד שחיפשת לא קיים או הועבר.',
  robots: { index: false, follow: false },
};

/** Ops (and future CF wildcard mirrors) must not keep users on the stealth host. */
function stealthLinkOrigin(host: string): string | null {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  if (isOpsHostname(h) || isOpsPreviewHostname(h)) {
    return publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app';
  }
  return null;
}

export default async function NotFoundPage() {
  let isAuthenticated = false;
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const absoluteOrigin = stealthLinkOrigin(host);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // On Ops stealth, never tailor CTAs as "logged in" — always send people to the public site.
    isAuthenticated = absoluteOrigin ? false : Boolean(user);
  } catch {
    isAuthenticated = false;
  }

  return <NotFoundClient isAuthenticated={isAuthenticated} absoluteOrigin={absoluteOrigin} />;
}
