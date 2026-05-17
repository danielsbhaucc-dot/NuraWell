import type { Metadata } from 'next';
import { RegisterLandingClient } from '@/components/onboarding/RegisterLandingClient';

export const metadata: Metadata = {
  title: 'הרשמה',
  description:
    'הצטרפו ל-NuraWell.ai — ליווי AI אישי לירידה במשקל ואורח חיים בריא. מנטור דולב מלווה אתכם מהרגע הראשון.',
  robots: { index: true, follow: true },
};

export default function RegisterPage() {
  return <RegisterLandingClient />;
}
