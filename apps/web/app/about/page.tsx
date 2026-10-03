import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart, Leaf, Route, Sparkles, Users } from 'lucide-react';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalCard, LegalSection, LegalCallout } from '@/components/legal/LegalParts';

const UPDATED_AT = '3 באוקטובר 2026';

export const metadata: Metadata = {
  title: 'אודות',
  description:
    'מי אנחנו ב-NuraWell — מסע מובנה לאורח חיים בריא עם מנטור AI, בלי דיאטות קיצוניות ובלי שיפוטיות.',
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <LegalShell
      icon={<Leaf className="w-8 h-8" />}
      title="אודות NuraWell"
      subtitle="בנינו מקום שבו שינוי אורח חיים מרגיש אנושי — בקצב שלכם, עם ליווי חכם ובלי עונשים."
      updatedAt={UPDATED_AT}
    >
      <LegalCard>
        <LegalCallout tone="info" icon={<Sparkles className="w-5 h-5" />}>
          <strong>NuraWell</strong> היא פלטפורמה לשינוי אורח חיים בריא: מסע אישי מובנה, מדריכים,
          הרגלים יומיים ומנטור AI (אלמוג) שמלווה אתכם ברגעים האמיתיים של היום — לא רק בתכנון.
        </LegalCallout>

        <LegalSection num="1" title="למה הקמנו את זה">
          <p>
            רוב האנשים לא נכשלים בגלל חוסר ידע — הם נתקעים ברגעים הקשים: עייפות, לחץ, סוף יום,
            או סתם יום שבו אין כוח. בנינו מערכת שזוכרת את ההקשר שלכם ונותנת נוכחות עדינה בדיוק אז.
          </p>
        </LegalSection>

        <LegalSection num="2" title="מה תמצאו כאן">
          <ul>
            <li>
              <strong>מסע מובנה</strong> — תחנות וצעדים שמתקדמים איתכם, לא מולכם.
            </li>
            <li>
              <strong>מנטור AI</strong> — אלמוג לצדכם בצ׳אט, עם עידוד ומשימות בקצב אנושי.
            </li>
            <li>
              <strong>מדריכים והרגלים</strong> — כלים מעשיים שמתחברים לשגרה האמיתית.
            </li>
          </ul>
        </LegalSection>

        <LegalSection num="3" title="העקרונות שלנו">
          <ul>
            <li>
              <Heart className="inline w-4 h-4 me-1 text-emerald-600" aria-hidden />
              בלי דיאטה קיצונית, בלי הרעבה, בלי שיפוטיות.
            </li>
            <li>
              <Users className="inline w-4 h-4 me-1 text-emerald-600" aria-hidden />
              ליווי שמרגיש כמו חבר אכפתי — לא כמו מאמן שצועק.
            </li>
            <li>
              <Route className="inline w-4 h-4 me-1 text-emerald-600" aria-hidden />
              צעדים קטנים שמתחברים לחיים, לא ל״שבוע הבא״.
            </li>
          </ul>
        </LegalSection>

        <LegalSection num="4" title="רוצים להתחיל או לדבר איתנו">
          <p>
            אפשר{' '}
            <Link href="/register" className="font-semibold text-emerald-700 underline">
              להירשם בחינם
            </Link>
            , או{' '}
            <Link href="/contact" className="font-semibold text-emerald-700 underline">
              ליצור קשר
            </Link>
            . לשאלות משפטיות ובטיחות ראו גם את{' '}
            <Link href="/terms" className="font-semibold text-emerald-700 underline">
              תנאי השימוש
            </Link>
            ,{' '}
            <Link href="/privacy" className="font-semibold text-emerald-700 underline">
              מדיניות הפרטיות
            </Link>{' '}
            ו־
            <Link href="/safety" className="font-semibold text-emerald-700 underline">
              מרכז הבטיחות
            </Link>
            .
          </p>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
