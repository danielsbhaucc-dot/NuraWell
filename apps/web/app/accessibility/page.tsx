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
} from 'lucide-react';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalCard, LegalSection, LegalCallout } from '@/components/legal/LegalParts';

const UPDATED_AT = '16 ביוני 2026';

export const metadata: Metadata = {
  title: 'נגישות וזכויות יוצרים',
  description:
    'הצהרת הנגישות של NuraWell לפי תקן ת״י 5568 ו-WCAG 2.1, לצד מדיניות זכויות היוצרים, הקניין הרוחני וייחוס צד-שלישי.',
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
          <p>אנו שואפים לעמוד בדרישות:</p>
          <ul>
            <li><strong>תקן ישראלי ת״י 5568</strong> להנגשת תכנים באינטרנט.</li>
            <li><strong>WCAG 2.1 רמה AA</strong> — הנחיות הנגישות הבינלאומיות.</li>
            <li><strong>תקנות שוויון זכויות לאנשים עם מוגבלות</strong> (התאמות נגישות לשירות), התשע״ג-2013.</li>
          </ul>
        </LegalSection>

        <LegalSection num="3" title="מה כבר יישמנו">
          <ul>
            <li><strong>תמיכה מלאה ב-RTL</strong> וממשק בעברית, המותאם לקריאה מימין לשמאל.</li>
            <li><Keyboard className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>ניווט מקלדת</strong> וקישור &quot;דילוג לתוכן הראשי&quot; בתחילת כל עמוד.</li>
            <li><MousePointerClick className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>סימון פוקוס ברור</strong> (focus-visible) לכל הרכיבים האינטראקטיביים.</li>
            <li><Eye className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> <strong>ניגודיות צבעים</strong> וטיפוגרפיה קריאה (גופני Heebo ו-Rubik).</li>
            <li><strong>מבנה סמנטי</strong> — כותרות, אזורים (landmarks) ותוויות (aria) לתמיכה בקוראי מסך.</li>
            <li><strong>כיבוד העדפת תנועה מופחתת</strong> (prefers-reduced-motion) — אנימציות מתעדנות אוטומטית.</li>
            <li><strong>עיצוב רספונסיבי</strong> המותאם לנייד, טאבלט ומחשב.</li>
            <li><strong>טקסט חלופי</strong> לתמונות ומדיה משמעותית.</li>
          </ul>
        </LegalSection>

        <LegalSection num="4" title="תאימות וטכנולוגיה מסייעת">
          <p>
            השירות נבדק לתאימות עם דפדפנים מודרניים עדכניים (Chrome, Safari, Firefox, Edge) ועם טכנולוגיות
            מסייעות נפוצות כגון קוראי מסך. מומלץ להשתמש בגרסה עדכנית של הדפדפן ושל הטכנולוגיה המסייעת לחוויה
            מיטבית.
          </p>
        </LegalSection>

        <LegalSection num="5" title="מגבלות ידועות">
          <p>
            למרות מאמצינו, ייתכן שחלקים מסוימים בשירות — בעיקר תכנים של צד שלישי (כגון נגני וידאו מוטמעים)
            — אינם נגישים במלואם. אנו פועלים לשיפור מתמיד ונשמח לקבל כל דיווח כדי לתקן.
          </p>
        </LegalSection>

        <LegalSection num="6" title="פנייה ורכז נגישות">
          <LegalCallout tone="info" icon={<Sparkles className="w-5 h-5" />}>
            נתקלת בקושי בנגישות, או יש לך הצעה לשיפור? נשמח לשמוע ונפעל לתקן בהקדם. פנה/י לרכז הנגישות שלנו:{' '}
            <a href="mailto:accessibility@nurawell.ai">accessibility@nurawell.ai</a>.
          </LegalCallout>
          <p>בפנייה, אנא תאר/י את הבעיה, העמוד שבו נתקלת בה, וסוג הדפדפן/הטכנולוגיה המסייעת שבהם השתמשת.</p>
        </LegalSection>

        <LegalSection num="7" title="הצהרת נגישות">
          <p>
            הצהרת נגישות זו עודכנה בתאריך {UPDATED_AT}. הנגישות נבדקת ומשופרת באופן שוטף כחלק
            ממחויבותנו המתמשכת.
          </p>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="8" title="זכויות יוצרים ובעלות">
          <LegalCallout tone="info" icon={<Copyright className="w-5 h-5" />}>
            © {new Date().getFullYear()} NuraWell. כל הזכויות שמורות.
          </LegalCallout>
          <p>
            כל הזכויות בשירות — לרבות הקוד, העיצוב, הממשק, הגרפיקה, התכנים, הקורסים, השיעורים, חומרי
            הלימוד, הסרטונים, הטקסטים והמסמכים — הן בבעלות NuraWell או של מעניקי הרישיון לה, ומוגנות
            בדיני זכויות יוצרים וקניין רוחני בישראל ובעולם.
          </p>
        </LegalSection>

        <LegalSection num="9" title="סימני מסחר">
          <p>
            השם &quot;NuraWell&quot;, הלוגו והסימנים המזוהים עם השירות הם סימני מסחר של NuraWell. אין
            לעשות בהם שימוש ללא הרשאה מפורשת בכתב. שמות וסימנים של צדדים שלישיים שייכים לבעליהם.
          </p>
        </LegalSection>

        <LegalSection num="10" title="רישיון שימוש מוגבל">
          <p>
            <ScrollText className="inline w-4 h-4 align-middle text-emerald-600" aria-hidden /> אנו
            מעניקים לך רישיון אישי, מוגבל, לא בלעדי ובלתי ניתן להעברה, לשימוש בשירות למטרותיך הפרטיות בלבד
            ובהתאם ל<Link href="/terms">תנאי השימוש</Link>. חל איסור להעתיק, לשכפל, להפיץ, למכור, לפרסם או
            ליצור יצירות נגזרות מהתוכן ללא אישורנו מראש ובכתב.
          </p>
        </LegalSection>

        <LegalSection num="11" title="תוכן משתמש">
          <p>
            הבעלות בתוכן שיצרת נותרת שלך. בעצם השימוש בשירות הינך מעניק/ה לנו רישיון מוגבל לעבד ולהציג
            אותו לצורך הפעלת השירות עבורך, כמפורט ב<Link href="/terms">תנאי השימוש</Link> וב
            <Link href="/privacy">מדיניות הפרטיות</Link>.
          </p>
        </LegalSection>

        <LegalSection num="12" title="הודעה על הפרת זכויות יוצרים">
          <LegalCallout tone="warn" icon={<Scale className="w-5 h-5" />}>
            סבור/ה שתוכן בשירות מפר את זכויותיך? פנה/י אלינו אל{' '}
            <a href="mailto:support@nurawell.ai">support@nurawell.ai</a> עם פירוט היצירה, מיקום ההפרה
            והוכחת בעלות — ונבדוק ונטפל בהקדם.
          </LegalCallout>
        </LegalSection>

        <LegalSection num="13" title="ייחוס לצד שלישי">
          <p>
            השירות עושה שימוש ברכיבי קוד פתוח, ספריות, גופנים ונכסים של צדדים שלישיים, בכפוף לרישיונות
            שלהם — בהם גופני Google Fonts (Heebo, Rubik), אייקוני Lucide, וספריות תוכנה בקוד פתוח. כל
            הזכויות ברכיבים אלה שמורות לבעליהן בהתאם לרישיון הרלוונטי.
          </p>
        </LegalSection>

        <LegalSection num="14" title="יצירת קשר">
          <p>
            לשאלות בנושא נגישות: <a href="mailto:accessibility@nurawell.ai">accessibility@nurawell.ai</a>.
            לשאלות בנושא זכויות יוצרים: <a href="mailto:support@nurawell.ai">support@nurawell.ai</a>.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
