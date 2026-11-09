import type { Metadata } from 'next';
import { OnboardingFormClient } from '@/components/onboarding/OnboardingFormClient';

export const metadata: Metadata = {
  title: 'שאלון הרשמה',
  description: 'שאלון קצר להכרות עם המנטור האישי דולב ב-NuraWell',
  robots: { index: false, follow: false },
};

export default async function RegisterFormPage() {
  // Registration stays the normal NuraWell form in every mode (NuraWell verification mail). A parent proof, when this
  // browser holds one, only pre-confirms the same address; the parent identity is linked at the first sign-in.
  return <OnboardingFormClient />;
}
