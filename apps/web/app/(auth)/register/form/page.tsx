import type { Metadata } from 'next';
import { OnboardingFormClient } from '@/components/onboarding/OnboardingFormClient';

export const metadata: Metadata = {
  title: 'שאלון הרשמה',
  description: 'שאלון קצר להכרות עם המנטור האישי דולב ב-NuraWell.ai',
  robots: { index: false, follow: false },
};

export default function RegisterFormPage() {
  return <OnboardingFormClient />;
}
