'use client';

import dynamic from 'next/dynamic';
import type { ProfileSummarySource } from '@/lib/onboarding/profile-summary-rows';

const AlmogFirstLoginDrawer = dynamic(
  () => import('./AlmogFirstLoginDrawer').then((m) => m.AlmogFirstLoginDrawer),
  { ssr: false }
);

type AlmogFirstLoginHostProps = {
  show: boolean;
  profile: ProfileSummarySource;
};

export function AlmogFirstLoginHost({ show, profile }: AlmogFirstLoginHostProps) {
  if (!show) return null;
  return <AlmogFirstLoginDrawer profile={profile} />;
}
