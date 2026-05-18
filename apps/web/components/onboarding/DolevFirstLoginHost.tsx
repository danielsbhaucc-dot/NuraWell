'use client';

import dynamic from 'next/dynamic';
import type { ProfileSummarySource } from '@/lib/onboarding/profile-summary-rows';

const DolevFirstLoginDrawer = dynamic(
  () => import('./DolevFirstLoginDrawer').then((m) => m.DolevFirstLoginDrawer),
  { ssr: false }
);

type DolevFirstLoginHostProps = {
  show: boolean;
  profile: ProfileSummarySource;
};

export function DolevFirstLoginHost({ show, profile }: DolevFirstLoginHostProps) {
  if (!show) return null;
  return <DolevFirstLoginDrawer profile={profile} />;
}
