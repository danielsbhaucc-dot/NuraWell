import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalCard, LegalSection, LegalCallout } from '@/components/legal/LegalParts';

const UPDATED_AT = '3 באוקטובר 2026';

export const metadata: Metadata = {
  title: 'צור קשר',
  description: 'יצירת קשר עם צוות NuraWell — תמיכה, פרטיות, נגישות ואבטחה.',
  alternates: { canonical: '/contact' },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <LegalShell
      icon={<Mail className="w-8 h-8" />}
      title="צור קשר"
      subtitle="אנחנו כאן לשאלות, משוב ותמיכה. בחרו את הערוץ המתאים — ונחזור אליכם בהקדם."
      updatedAt={UPDATED_AT}
    >
      <LegalCard>
        <LegalCallout tone="info" icon={<Sparkles className="w-5 h-5" />}>
          לשאלות כלליות ותמיכה במוצר:{' '}
          <a href="mailto:support@nurawell.ai" className="font-semibold underline">
            support@nurawell.ai
          </a>
          . נשתדל להשיב בהקדם האפשרי בימי עסקים.
        </LegalCallout>

        <LegalSection num="1" title="ערוצי יצירת קשר">
          <ul>
            <li>
              <MessageCircle className="inline w-4 h-4 me-1 text-emerald-600" aria-hidden />
              <strong>תמיכה כללית:</strong>{' '}
              <a href="mailto:support@nurawell.ai">support@nurawell.ai</a>
            </li>
            <li>
              <strong>פרטיות ומידע אישי:</strong>{' '}
              <a href="mailto:privacy@nurawell.ai">privacy@nurawell.ai</a>
            </li>
            <li>
              <strong>נגישות:</strong>{' '}
              <a href="mailto:accessibility@nurawell.ai">accessibility@nurawell.ai</a>
            </li>
            <li>
              <ShieldCheck className="inline w-4 h-4 me-1 text-emerald-600" aria-hidden />
              <strong>אבטחת מידע:</strong>{' '}
              <a href="mailto:security@nurawell.ai">security@nurawell.ai</a>
            </li>
          </ul>
        </LegalSection>

        <LegalSection num="2" title="לפני שפונים">
          <p>
            אם כבר יש לכם חשבון — אפשר גם לפנות לאלמוג בתוך האפליקציה, או לבדוק את{' '}
            <Link href="/safety" className="font-semibold text-emerald-700 underline">
              מרכז הבטיחות
            </Link>{' '}
            ואת{' '}
            <Link href="/accessibility" className="font-semibold text-emerald-700 underline">
              הצהרת הנגישות
            </Link>
            . למשתמשי קצה בלי חשבון — המיילים למעלה הם הנתיב הנכון.
          </p>
        </LegalSection>

        <LegalSection num="3" title="חירום רפואי או נפשי">
          <LegalCallout tone="danger">
            NuraWell אינה שירות חירום. במצב סכנה מיידית — פנו למוקד החירום המקומי (בישראל: 101
            למגן דוד אדום, 100 למשטרה) או לקווי סיוע מוכרים. פרטים נוספים ב־
            <Link href="/safety" className="font-semibold underline">
              דף הבטיחות
            </Link>
            .
          </LegalCallout>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
