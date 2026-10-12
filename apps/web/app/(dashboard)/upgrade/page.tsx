import { redirect } from 'next/navigation';

/** Legacy paywall route → the single pricing page (plans config: lib/billing/plans.ts). */
export default function UpgradePage() {
  redirect('/pricing');
}
