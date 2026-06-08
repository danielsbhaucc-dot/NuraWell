import type { Metadata } from 'next';
import { LandingAiClient } from '@/components/landing/LandingAiClient';

export const metadata: Metadata = {
  title: 'NuraWell AI | מנטור AI אישי לאורח חיים בריא',
  description:
    'דף נחיתה AI-First של NuraWell — מנטור AI אישי שלומד אתכם, בונה מסע מותאם ומלווה כל יום. בלי דיאטה, בלי שיפוטיות.',
  alternates: { canonical: '/v2' },
};

export default function LandingV2Page() {
  return <LandingAiClient />;
}
