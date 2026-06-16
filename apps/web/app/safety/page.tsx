import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, HeartPulse, LifeBuoy, Phone, Bug, Brain, Users } from 'lucide-react';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalCard, LegalSection, LegalCallout } from '@/components/legal/LegalParts';

const UPDATED_AT = '16 ביוני 2026';

export const metadata: Metadata = {
  title: 'בטיחות',
  description:
    'מרכז הבטיחות של NuraWell — אמצעי הבטיחות הבריאותיים, התמיכה ברגעי משבר, מספרי החירום ואמצעי אבטחת המידע והחשבון.',
  alternates: { canonical: '/safety' },
  robots: { index: true, follow: true },
};

export default function SafetyPage() {
  return (
    <LegalShell
      icon={<ShieldCheck className="w-8 h-8" />}
      title="בטיחות"
      subtitle="הבטיחות שלך — הגוף, הנפש והמידע — היא בראש סדר העדיפויות. כאן מרוכזים כל אמצעי ההגנה שבנינו עבורך."
      updatedAt={UPDATED_AT}
    >
      <LegalCard>
        <LegalCallout tone="info" icon={<HeartPulse className="w-5 h-5" />}>
          NuraWell נבנתה מתוך אכפתיות. בנינו מנגנוני בטיחות בשלוש שכבות: <strong>בטיחות בריאותית</strong>,
          <strong> בטיחות רגשית ותמיכה במשבר</strong>, ו<strong>אבטחת מידע וחשבון</strong>. עמוד זה מסביר כל
          אחת מהן ומה לעשות במצב חירום.
        </LegalCallout>

        <LegalSection num="1" title="בטיחות בריאותית — קראו זאת תחילה">
          <LegalCallout tone="danger" icon={<HeartPulse className="w-5 h-5" />}>
            <strong>NuraWell אינה מספקת ייעוץ, אבחון או טיפול רפואי.</strong> התכנים והמלצות מנטור ה-AI
            הם למידע ולהעצמה בלבד, ואינם תחליף לאיש/ת מקצוע מוסמך/ת בתחום הבריאות.
          </LegalCallout>
          <p>כדי לשמור על בריאותך, אנא הקפד/י:</p>
          <ul>
            <li>היוועצ/י ברופא/ה לפני שינוי תזונה, תחילת פעילות גופנית או שינוי באורח החיים.</li>
            <li>חשוב במיוחד להיוועץ אם את/ה בהיריון או מניקה, סובל/ת ממצב רפואי כרוני, או נוטל/ת תרופות.</li>
            <li>אל תתעלמ/י מתסמינים גופניים. אם משהו לא תקין — הפסק/י ופנה/י לרופא/ה.</li>
            <li>NuraWell אינה מקדמת הרעבה, דיאטות קיצוניות או ספירת קלוריות אובססיבית — המטרה היא בריאות בת-קיימא.</li>
          </ul>
        </LegalSection>

        <LegalSection num="2" title="בריאות נפשית והפרעות אכילה">
          <LegalCallout tone="warn" icon={<Brain className="w-5 h-5" />}>
            אם את/ה מתמודד/ת עם הפרעת אכילה או יחס מורכב לאוכל ולגוף — חשוב לעשות זאת בליווי איש/ת מקצוע.
            NuraWell אינה מחליפה טיפול נפשי.
          </LegalCallout>
          <p>
            המערכת תוכננה כדי <strong>להפחית אובססיביות</strong> ולא להגביר אותה: אנו נמנעים משיימינג,
            מעודדים גישה חומלת, ומגבילים שימוש חוזר ולחוץ בכלים מסוימים כדי למנוע התנהגות כפייתית.
          </p>
        </LegalSection>

        <LegalSection num="3" title="ה״שומר״ — תמיכה ברגעי משבר (Pre-Lapse Guardian)">
          <p>
            בנינו מנגנון תמיכה שמלווה אותך ברגעים קשים. כשאת/ה לוחצ/ת על &quot;SOS&quot;, המערכת מציעה
            אסטרטגיה מותאמת כדי לעבור את הרגע, ולומדת מה עוזר לך לאורך זמן.
          </p>
          <ul>
            <li><strong>זיהוי מצוקה והסלמה:</strong> אם מזוהה סימן למצוקה אמיתית, המערכת מסמנת זאת (red flag) ומפנה אותך לעזרה אנושית מתאימה — במקום להמשיך בליווי אוטומטי.</li>
            <li><strong>הגנה מפני שימוש כפייתי:</strong> קיימות מגבלות יומיות שנועדו להגן עליך מפני הסתמכות-יתר על הכלי.</li>
            <li><strong>פרטיות:</strong> נתוני ה-SOS משמשים לתמיכה ולשיפור בלבד. ראה/י <Link href="/privacy">מדיניות הפרטיות</Link>.</li>
          </ul>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="4" title="במצב חירום — פנו לעזרה מיידית">
          <LegalCallout tone="danger" icon={<LifeBuoy className="w-5 h-5" />}>
            אם את/ה או מישהו בסביבתך בסכנה מיידית — <strong>אל תסתמכ/י על האפליקציה</strong>. פנה/י עכשיו
            לאחד מהגורמים הבאים (ישראל):
          </LegalCallout>
          <div className="legal-emergency-grid">
            <div className="legal-emergency-item">
              <div className="num">101</div>
              <div className="label">מד״א — חירום רפואי</div>
            </div>
            <div className="legal-emergency-item">
              <div className="num">1201</div>
              <div className="label">ער״ן — עזרה ראשונה נפשית</div>
            </div>
            <div className="legal-emergency-item">
              <div className="num">1800-120-140</div>
              <div className="label">סה״ר — סיוע והקשבה ברשת</div>
            </div>
            <div className="legal-emergency-item">
              <div className="num">100</div>
              <div className="label">משטרה</div>
            </div>
          </div>
          <p>
            <Phone className="inline w-4 h-4 align-middle" aria-hidden /> ניתן לפנות לער״ן גם בצ׳אט באתר
            שלהם. אינך לבד — תמיד יש למי לפנות.
          </p>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="5" title="אבטחת מידע וטכנולוגיה">
          <p>אנו מגנים על המידע שלך באמצעים טכניים מחמירים, ביניהם:</p>
          <ul>
            <li><strong>בקרת גישה ברמת השורה (RLS):</strong> כל משתמש יכול לגשת אך ורק לנתונים של עצמו — מאוכף ברמת מסד הנתונים.</li>
            <li><strong>הצפנת תעבורה (HTTPS):</strong> כל התקשורת בין המכשיר שלך לשרתים מוצפנת.</li>
            <li><strong>מדיניות אבטחת תוכן (CSP):</strong> עם nonce ייחודי לכל בקשה, להגנה מפני הזרקת קוד (XSS).</li>
            <li><strong>הזדהות מאובטחת:</strong> סיסמאות נשמרות מגובבות בלבד, עם אימות דוא״ל וניהול הרשאות מבוסס תפקיד.</li>
            <li><strong>הפרדת הרשאות והקשחה:</strong> מניעת הסלמת הרשאות, נעילת פונקציות רגישות, והפרדה בין משתמש לשירות.</li>
            <li><strong>בידוד תוכן:</strong> חומרי לימוד נחשפים רק למשתמשים מורשים ומחוברים.</li>
          </ul>
          <p>
            פירוט מלא על המידע הנאסף וההגנות עליו מופיע ב<Link href="/privacy">מדיניות הפרטיות</Link>.
          </p>
        </LegalSection>

        <LegalSection num="6" title="בטיחות החשבון שלך">
          <ul>
            <li><strong>סיסמה חזקה:</strong> השתמש/י בסיסמה ייחודית וחזקה, ואל תשתפ/י אותה.</li>
            <li><strong>שמירה על מכשירך:</strong> התנתק/י ממכשירים משותפים ושמור/י על תיבת הדוא״ל שלך מאובטחת.</li>
            <li><strong>זהירות מהתחזות (Phishing):</strong> לעולם לא נבקש את סיסמתך בדוא״ל. הקפד/י להתחבר רק דרך האתר הרשמי.</li>
            <li><strong>דיווח מיידי:</strong> אם את/ה חושד/ת בפעילות חריגה בחשבונך — פנה/י אלינו מיד.</li>
          </ul>
        </LegalSection>

        <LegalSection num="7" title="דיווח אחראי על פרצות אבטחה">
          <LegalCallout tone="info" icon={<Bug className="w-5 h-5" />}>
            מצאת חולשת אבטחה? נשמח לשמוע. אנא דווח/י באופן אחראי אל{' '}
            <a href="mailto:security@nurawell.ai">security@nurawell.ai</a> — ואל תנצל/י את החולשה או
            תחשוף/י אותה בפומבי לפני שנתקן אותה.
          </LegalCallout>
        </LegalSection>

        <LegalSection num="8" title="בטיחות ילדים">
          <p>
            <Users className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> השירות אינו
            מיועד לילדים מתחת לגיל 16, ואיננו אוספים מהם מידע ביודעין. ראה/י{' '}
            <Link href="/terms">תנאי השימוש</Link> ו<Link href="/privacy">מדיניות הפרטיות</Link>.
          </p>
        </LegalSection>

        <LegalSection num="9" title="יצירת קשר">
          <p>
            לשאלות בנושאי בטיחות: <a href="mailto:support@nurawell.ai">support@nurawell.ai</a>.
            לנושאי אבטחת מידע: <a href="mailto:security@nurawell.ai">security@nurawell.ai</a>.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
