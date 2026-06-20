import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Accessibility,
  Keyboard,
  Eye,
  MousePointerClick,
  Copyright,
  ScrollText,
  Scale,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { AccessibilityRestoreWidget } from '@/components/a11y/AccessibilityRestoreWidget';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalCard, LegalSection, LegalCallout } from '@/components/legal/LegalParts';

const UPDATED_AT = '20 ביוני 2026';

export const metadata: Metadata = {
  title: 'נגישות וזכויות יוצרים',
  description:
    'הצהרת הנגישות של NuraWell לפי תקן ת״י 5568 ו-WCAG 2.2, לצד מדיניות זכויות היוצרים, הקניין הרוחני וייחוס צד-שלישי.',
  alternates: { canonical: '/accessibility' },
  robots: { index: true, follow: true },
};

export default function AccessibilityPage() {
  return (
    <LegalShell
      icon={<Accessibility className="w-8 h-8" />}
      title="נגישות וזכויות יוצרים"
      subtitle="אנו מחויבים לחוויה נגישה ושוויונית לכולם, ולשמירה מלאה על זכויות היוצרים והקניין הרוחני."
      updatedAt={UPDATED_AT}
    >
      <LegalCard>
        <LegalCallout tone="info" icon={<Accessibility className="w-5 h-5" />}>
          <strong>הנגישות חשובה לנו.</strong> אנו משקיעים מאמץ מתמשך כדי שאנשים עם מוגבלות יוכלו לגלוש,
          ללמוד ולהתקדם ב-NuraWell בנוחות, עצמאות ושוויון.
        </LegalCallout>

        <LegalSection num="1" title="מחויבות לנגישות">
          <p>
            NuraWell פועלת להנגיש את השירות לכלל המשתמשים, לרבות אנשים עם מוגבלות, מתוך אמונה בזכות
            השוויונית לגישה למידע ולכלים דיגיטליים. אנו רואים בנגישות תהליך מתמשך ומשפרים אותו באופן
            קבוע.
          </p>
        </LegalSection>

        <LegalSection num="2" title="התקנים שאנו פועלים לפיהם">
          <p>אנו פועלים להנגשת השירות בהתאם ל:</p>
          <ul>
            <li><strong>תקן ישראלי ת״י 5568</strong> (מבוסס WCAG 2.0) — הנגשת תכנים באינטרנט.</li>
            <li><strong>WCAG 2.2 רמה AA</strong> — יעד הנגשה שאליו אנו מתקדמים (לא הושג במלואו).</li>
            <li><strong>תקנות שוויון זכויות לאנשים עם מוגבלות</strong> (התאמות נגישות לשירות), התשע״ג-2013.</li>
          </ul>
        </LegalSection>

        <LegalSection num="2א" title="סטטוס תאימות (חשוב)">
          <LegalCallout tone="warn" icon={<Sparkles className="w-5 h-5" />}>
            <strong>השירות לא הוכרז כנגיש במלואו לפי WCAG 2.2 AA.</strong> ביצענו תשתית נגישות
            (תפריט התאמות, skip link, zoom, כלי alt בניהול) וממשיכים בתיקונים שיטתיים. הצהרה זו
            מתארת את המצב הנוכחי ואת המחויבות — ולא מהווה אישור ביקורת חיצונית.
          </LegalCallout>
          <p>
            לפי דין, נדרשת הצהרת נגישות מעודכנת, ערוץ פנייה ורכז נגישות — אלו קיימים בדף זה. השגת
            תאימות מלאה דורשת ביקורת ידנית ואוטומטית של כל המסכים, תיקון פערים, ובדיקות עם
            טכנולוגיות מסייעות — תהליך מתמשך שאנו מבצעים.
          </p>
        </LegalSection>

        <LegalSection num="3" title="תפריט נגישות">
          <p>
            באתר זמין <strong>תפריט נגישות</strong> (כפתור עם סמל נגישות בפינה התחתונה) המאפשר:
          </p>
          <ul>
            <li><strong>התאמות ויזואליות:</strong> ניגודיות גבוהה, מונוכרום, רוויה נמוכה/גבוהה, הדגשת קישורים וכותרות.</li>
            <li><strong>התאמות תוכן:</strong> גודל טקסט, ריווח שורות, ריווח אותיות, גופן קריא.</li>
            <li><strong>התאמות ניווט:</strong> הדגשת פוקוס, הדגשת אלמנטים, מבנה העמוד (landmarks), סמן גדול, הפחתת תנועה, השתק מדיה.</li>
            <li><strong>איפוס:</strong> כפתור &quot;איפוס כל ההתאמות&quot; מחזיר לברירת המחדל.</li>
          </ul>
          <p>
            התפריט <strong>אינו</strong> כולל סיכום AI, מילון או הוספת כתוביות — כתוביות לווידאו מוטמעות
            ישירות בתוכן (באחריותנו), והשאר אינו רלוונטי לשירות.
          </p>
          <p>
            ניתן להסתיר את התפריט — הבחירה נשמרת בדפדפן. להחזרת התפריט:
          </p>
          <AccessibilityRestoreWidget />
        </LegalSection>

        <LegalSection num="4" title="מה כבר יישמנו">
          <ul>
            <li><strong>תמיכה מלאה ב-RTL</strong> וממשק בעברית, המותאם לקריאה מימין לשמאל.</li>
            <li><Keyboard className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>ניווט מקלדת</strong> וקישור &quot;דילוג לתוכן הראשי&quot; בתחילת כל עמוד.</li>
            <li><MousePointerClick className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>סימון פוקוס ברור</strong> (focus-visible) לכל הרכיבים האינטראקטיביים.</li>
            <li><Eye className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>ניגודיות צבעים</strong> וטיפוגרפיה קריאה (גופני Heebo ו-Rubik).</li>
            <li><strong>מבנה סמנטי</strong> — כותרות, אזורים (landmarks), תוויות ARIA ו-<code>aria-current</code> בניווט.</li>
            <li><strong>כיבוד העדפת תנועה מופחתת</strong> (prefers-reduced-motion) — אנימציות מתעדנות אוטומטית, ובנוסף אפשרות ידנית בתפריט הנגישות.</li>
            <li><strong>הגדלת תצוגה</strong> — תמיכה ב-zoom עד 500% (WCAG 1.4.4).</li>
            <li><strong>עיצוב רספונסיבי</strong> המותאם לנייד, טאבלט ומחשב.</li>
            <li><strong>Modals ו-lightbox</strong> — focus trap, <code>role=&quot;dialog&quot;</code>, סגירה ב-Escape (SOS, משימות היום, גלריית תמונות).</li>
            <li><strong>סריקת alt</strong> — תיקון תמונות במסע, מדיה, התראות ו-stock; רקעים דקораטיביים מסומנים ב-<code>aria-hidden</code>.</li>
            <li><strong>כלי ניהול</strong> — ביקורת alt ויצירה אוטומטית ב-<Link href="/ops/accessibility">לוח הבקרה</Link>.</li>
            <li><SlidersHorizontal className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>שמירת העדפות נגישות</strong> ב-localStorage בדפדפן.</li>
          </ul>
        </LegalSection>

        <LegalSection num="5" title="תאימות וטכנולוגיה מסייעת">
          <p>
            השירות נבדק לתאימות עם דפדפנים מודרניים עדכניים (Chrome, Safari, Firefox, Edge) ועם טכנולוגיות
            מסייעות נפוצות כגון קוראי מסך. מומלץ להשתמש בגרסה עדכנית של הדפדפן ושל הטכנולוגיה המסייעת לחוויה
            מיטבית.
          </p>
        </LegalSection>

        <LegalSection num="6" title="מגבלות ידועות">
          <p>נכון ל-{UPDATED_AT}, בין הפערים שטרם תוקנו במלואם:</p>
          <ul>
            <li>חלק מה-drawers (Vaul) — לא כל dialog עבר לאיחוד מלא עם focus trap.</li>
            <li>נגני וידאו ותכני צד שלישי — עשויים שלא לכלול כתוביות/תיאור קולי.</li>
            <li>ממשק צ׳אט AI בזמן אמת — תוכן דינמי שקשה להבטיח נגישות מלאה בכל מצב.</li>
            <li>לא בוצעה עדיין ביקורת WCAG 2.2 AA אוטומטית (axe) על כל עמודי האתר.</li>
          </ul>
          <p>
            אנו פועלים לשיפור מתמיד. דיווחים ממשתמשים עוזרים לנו לתעדף תיקונים — פנה/י לרכז הנגישות.
          </p>
        </LegalSection>

        <LegalSection num="7" title="פנייה ורכז נגישות">
          <LegalCallout tone="info" icon={<Sparkles className="w-5 h-5" />}>
            נתקלת בקושי בנגישות, או יש לך הצעה לשיפור? נשמח לשמוע ונפעל לתקן בהקדם. פנה/י לרכז הנגישות שלנו:{' '}
            <a href="mailto:accessibility@nurawell.ai">accessibility@nurawell.ai</a>.
          </LegalCallout>
          <p>בפנייה, אנא תאר/י את הבעיה, העמוד שבו נתקלת בה, וסוג הדפדפן/הטכנולוגיה המסייעת שבהם השתמשת.</p>
        </LegalSection>

        <LegalSection num="8" title="הצהרת נגישות">
          <p>
            הצהרת נגישות זו עודכנה בתאריך {UPDATED_AT}. הנגישות נבדקת ומשופרת באופן שוטף כחלק
            ממחויבותנו המתמשכת.
          </p>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="9" title="זכויות יוצרים ובעלות">
          <LegalCallout tone="info" icon={<Copyright className="w-5 h-5" />}>
            © {new Date().getFullYear()} NuraWell. כל הזכויות שמורות.
          </LegalCallout>
          <p>
            כל הזכויות בשירות — לרבות הקוד, העיצוב, הממשק, הגרפיקה, התכנים, הקורסים, השיעורים, חומרי
            הלימוד, הסרטונים, הטקסטים והמסמכים — הן בבעלות NuraWell או של מעניקי הרישיון לה, ומוגנות
            בדיני זכויות יוצרים וקניין רוחני בישראל ובעולם.
          </p>
        </LegalSection>

        <LegalSection num="10" title="סימני מסחר">
          <p>
            השם &quot;NuraWell&quot;, הלוגו והסימנים המזוהים עם השירות הם סימני מסחר של NuraWell. אין
            לעשות בהם שימוש ללא הרשאה מפורשת בכתב. שמות וסימנים של צדדים שלישיים שייכים לבעליהם.
          </p>
        </LegalSection>

        <LegalSection num="11" title="רישיון שימוש מוגבל">
          <p>
            <ScrollText className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> אנו
            מעניקים לך רישיון אישי, מוגבל, לא בלעדי ובלתי ניתן להעברה, לשימוש בשירות למטרותיך הפרטיות בלבד
            ובהתאם ל<Link href="/terms">תנאי השימוש</Link>. חל איסור להעתיק, לשכפל, להפיץ, למכור, לפרסם או
            ליצור יצירות נגזרות מהתוכן ללא אישורנו מראש ובכתב.
          </p>
        </LegalSection>

        <LegalSection num="12" title="תוכן משתמש">
          <p>
            הבעלות בתוכן שיצרת נותרת שלך. בעצם השימוש בשירות הינך מעניק/ה לנו רישיון מוגבל לעבד ולהציג
            אותו לצורך הפעלת השירות עבורך, כמפורט ב<Link href="/terms">תנאי השימוש</Link> וב
            <Link href="/privacy">מדיניות הפרטיות</Link>.
          </p>
        </LegalSection>

        <LegalSection num="13" title="הודעה על הפרת זכויות יוצרים">
          <LegalCallout tone="warn" icon={<Scale className="w-5 h-5" />}>
            סבור/ה שתוכן בשירות מפר את זכויותיך? פנה/י אלינו אל{' '}
            <a href="mailto:support@nurawell.ai">support@nurawell.ai</a> עם פירוט היצירה, מיקום ההפרה
            והוכחת בעלות — ונבדוק ונטפל בהקדם.
          </LegalCallout>
        </LegalSection>

        <LegalSection num="14" title="ייחוס לצד שלישי">
          <p>
            השירות עושה שימוש ברכיבי קוד פתוח, ספריות, גופנים ונכסים של צדדים שלישיים, בכפוף לרישיונות
            שלהם — בהם גופני Google Fonts (Heebo, Rubik), אייקוני Lucide, וספריות תוכנה בקוד פתוח. כל
            הזכויות ברכיבים אלה שמורות לבעליהן בהתאם לרישיון הרלוונטי.
          </p>
        </LegalSection>

        <LegalSection num="15" title="יצירת קשר">
          <p>
            לשאלות בנושא נגישות: <a href="mailto:accessibility@nurawell.ai">accessibility@nurawell.ai</a>.
            לשאלות בנושא זכויות יוצרים: <a href="mailto:support@nurawell.ai">support@nurawell.ai</a>.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
