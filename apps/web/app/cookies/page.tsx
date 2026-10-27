import type { Metadata } from 'next';
import Link from 'next/link';
import { Ban, Lock, Smartphone } from 'lucide-react';
import '../legal-v2.css';
import { LegalDoc, LegalDataTable, type LegalDocSection } from '@/lib/module-api/legal/components-legal-v2-LegalDoc';
import { LEGAL_THEME } from '@/lib/module-api/legal/components-legal-v2-theme';
import { LEGAL_PRIVACY_EMAIL } from '@/lib/module-api/legal/lib-legal-contact';
import { COOKIE_GROUPS } from '@/lib/module-api/legal/lib-legal-cookie-inventory';
import { CookieWink, OpenCookiePanelButton } from '@/lib/module-api/legal/components-legal-cookies-CookieNotice';

export const metadata: Metadata = {
  title: 'מדיניות עוגיות',
  description: 'כל מה שנשמר במכשיר בזמן השימוש ב־NuraWell: מה, למה ולכמה זמן. בלי מעקב ובלי פרסום.',
  alternates: { canonical: '/cookies' },
  robots: { index: true, follow: true },
};

const COLS = ['שם', 'מה עושה', 'משך שמירה', 'למה צריך'];
const group = (id: string) => COOKIE_GROUPS.find((g) => g.id === id)!;
const table = (id: string) => {
  const g = group(id);
  return (
    <LegalDataTable
      caption={g.title}
      columns={COLS}
      rows={g.items.map((it) => [
        <span key="n">{it.label}<br /><code dir="ltr">{it.name}</code></span>,
        it.what,
        it.duration,
        it.why,
      ])}
    />
  );
};

const sections: LegalDocSection[] = [
  {
    id: 'what',
    title: 'מה זה עוגיות',
    short: 'קבצים קטנים שהדפדפן שומר, כדי שהאתר יזכור דברים בסיסיים בין עמוד לעמוד.',
    body: (
      <p>
        עוגייה היא קובץ טקסט קטן שהאתר שומר בדפדפן. אצלנו יש גם &quot;אחסון מקומי&quot;, שעובד בדומה אבל נשאר רק
        במכשיר ולא נשלח אלינו. בעמוד הזה מפורטים שניהם.
      </p>
    ),
  },
  { id: 'auth', open: true, title: group('auth').title, short: group('auth').short, body: table('auth') },
  { id: 'ops', title: group('ops').title, short: group('ops').short, body: table('ops') },
  { id: 'device', title: group('device').title, short: group('device').short, body: table('device') },
  {
    id: 'unused',
    title: 'מה אין אצלנו',
    short: 'אין עוגיות מדידה, סטטיסטיקה, פרסום או מעקב בין אתרים.',
    body: (
      <>
        <p>
          אין אצלנו כלי אנליטיקה, פיקסלים של רשתות חברתיות או עוגיות פרסום. שתי הקטגוריות האלה מוצגות בחלון העוגיות
          ככבויות. אם נרצה להוסיף אי פעם עוגייה שאינה חיונית, היא לא תופעל לפני שנבקש הסכמה מפורשת.
        </p>
        <p>
          <OpenCookiePanelButton>לפתיחת חלון העוגיות</OpenCookiePanelButton>
        </p>
      </>
    ),
  },
  {
    id: 'control',
    title: 'שליטה ומחיקה',
    short: 'אפשר למחוק עוגיות בכל רגע מהגדרות הדפדפן.',
    body: (
      <>
        <p>
          מוחקים בהגדרות הדפדפן, תחת &quot;פרטיות&quot; או &quot;נתוני אתרים&quot;. אחרי מחיקה צריך להתחבר שוב,
          וההעדפות במכשיר יחזרו לברירת המחדל.
        </p>
        <p>
          כל העוגיות שלנו חיוניות להפעלת השירות ולאבטחתו, ולכן אין צורך בהסכמה נפרדת עליהן ואין כפתור
          &quot;דחייה&quot;. פרטים נוספים על המידע שנאסף נמצאים ב<Link href="/privacy">מדיניות הפרטיות</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'עדכונים ופניות',
    short: 'כל שינוי יתעדכן כאן עם תאריך. שאלות נשלחות למייל הפרטיות.',
    body: (
      <p>
        אם משהו ישתנה, נעדכן את התאריך בראש העמוד ונציג שוב את הודעת העוגיות באתר. לשאלות:{' '}
        <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalDoc
      theme={LEGAL_THEME}
      currentPath="/cookies"
      eyebrow="מדיניות עוגיות"
      title="שומרים רק על"
      titleAccent="מה שצריך."
      lead="כל מה שנשמר במכשיר בזמן השימוש ב־NuraWell: מה, למה ולכמה זמן. בלי מעקב, בלי פרסום."
      leadExtra={<CookieWink className="ld-wink" />}
      stat={{ big: '0', label: 'עוגיות פרסום או מעקב', text: 'רק מה שחיוני כדי שהאתר יעבוד ויהיה מאובטח.' }}
      updatedAt="20 באוקטובר 2026"
      version="1.0"
      summary={[
        { icon: <Lock className="w-5 h-5" />, title: 'רק חיוניות', text: 'חיבור לחשבון ואבטחה. בלעדיהן האתר לא עובד.' },
        { icon: <Ban className="w-5 h-5" />, title: 'בלי מעקב', text: 'אין אנליטיקה, אין פרסום, אין פיקסלים.' },
        { icon: <Smartphone className="w-5 h-5" />, title: 'העדפות נשארות אצלך', text: 'הגדרות תצוגה נשמרות רק במכשיר.' },
      ]}
      sections={sections}
    />
  );
}
