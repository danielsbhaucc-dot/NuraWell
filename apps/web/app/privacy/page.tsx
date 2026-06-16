import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldCheck,
  Eye,
  UserCircle,
  HeartPulse,
  MessageSquare,
  ClipboardList,
  TrendingUp,
  PlayCircle,
  LifeBuoy,
  Brain,
  Bell,
  Cookie,
  Server,
  Lock,
} from 'lucide-react';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  LegalCard,
  LegalSection,
  LegalCallout,
  LegalDataGrid,
  LegalDataItem,
} from '@/components/legal/LegalParts';

const UPDATED_AT = '16 ביוני 2026';

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description:
    'מדיניות הפרטיות המפורטת והשקופה של NuraWell — בדיוק אילו נתונים נאספים, מדוע, עם מי הם משותפים, וכיצד לממש את זכויותיך.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      icon={<ShieldCheck className="w-8 h-8" />}
      title="מדיניות פרטיות"
      subtitle="שקיפות מלאה: כאן מפורט כל פריט מידע שאנו אוספים, מדוע הוא נחוץ, עם מי הוא משותף, וכיצד תוכל/י לשלוט בו."
      updatedAt={UPDATED_AT}
    >
      <LegalCard>
        <LegalCallout tone="info" icon={<Eye className="w-5 h-5" />}>
          אנו מאמינים בשקיפות מוחלטת. מדיניות זו נכתבה כדי שתבין/י <strong>בדיוק</strong> אילו נתונים
          נאספים — עד הפרט הקטן ביותר — ולשם מה. אנו פועלים על-פי עקרון <strong>מינימליזציה</strong>:
          אוספים רק את מה שנדרש כדי להעניק לך את השירות וללוות אותך באמת.
        </LegalCallout>

        <LegalSection num="1" title="מי אחראי על המידע">
          <p>
            NuraWell (&quot;<strong>אנחנו</strong>&quot;) היא בעלת המאגר והאחראית לעיבוד המידע האישי
            שלך (&quot;Data Controller&quot;). מדיניות זו חלה על כל שימוש בשירות — באתר, באפליקציה
            ובמנטור ה-AI. לכל שאלה ניתן לפנות אל ממונה הגנת הפרטיות שלנו:{' '}
            <a href="mailto:privacy@nurawell.ai">privacy@nurawell.ai</a>.
          </p>
        </LegalSection>

        <LegalSection num="2" title="הבסיס החוקי לעיבוד">
          <p>אנו מעבדים את המידע על בסיס אחת או יותר מהעילות הבאות:</p>
          <ul>
            <li><strong>ביצוע חוזה</strong> — לצורך אספקת השירות שביקשת והפעלת חשבונך.</li>
            <li><strong>הסכמה</strong> — בעיקר ביחס למידע בריאותי רגיש ולהתראות, אותה ניתן למשוך בכל עת.</li>
            <li><strong>אינטרס לגיטימי</strong> — לשיפור, אבטחה ומניעת הונאה, באיזון מול זכויותיך.</li>
            <li><strong>חובה חוקית</strong> — כאשר נדרש על-פי דין.</li>
          </ul>
          <p>
            פעילותנו כפופה לחוק הגנת הפרטיות, התשמ&quot;א-1981 ולתקנות מכוחו, ובכל מקום בו רלוונטי — גם
            לעקרונות תקנת ה-GDPR האירופית.
          </p>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="3" title="אילו נתונים נאספים — וגם למה (פירוט מלא)">
          <p>
            להלן פירוט מלא ושקוף של כל קטגוריות המידע שהמערכת אוספת ושומרת. כל פריט כולל הסבר מדויק
            <strong> מה נאסף</strong> ו<strong>מדוע</strong>.
          </p>

          <h3>א. פרטי חשבון והזדהות</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<UserCircle className="w-4 h-4 text-emerald-600" />}
              title="כתובת דוא״ל וסיסמה"
              what="כתובת הדוא״ל שלך וסיסמה (הסיסמה נשמרת מוצפנת/מגובבת בלבד על-ידי ספק האימות Supabase ואינה גלויה לנו), סטטוס אימות הדוא״ל ותאריך ההתחברות האחרון."
              why="כדי ליצור חשבון, לאמת את זהותך, לאפשר התחברות מאובטחת ולשחזר גישה."
            />
            <LegalDataItem
              icon={<Lock className="w-4 h-4 text-emerald-600" />}
              title="אסימוני התחברות (Session)"
              what="עוגיות הזדהות מאובטחות (session cookies) ואסימוני גישה זמניים."
              why="כדי לשמור אותך מחובר/ת בין דפים ולמנוע צורך בהתחברות חוזרת בכל פעולה."
            />
          </LegalDataGrid>

          <h3>ב. פרופיל ונתוני הצטרפות (Onboarding)</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<UserCircle className="w-4 h-4 text-emerald-600" />}
              title="פרטים אישיים"
              what="שם מלא, תמונת פרופיל (אם הועלתה), מספר טלפון, תאריך לידה, ומגדר."
              why="כדי להתאים אישית את הליווי, לפנות אליך בשמך ולחשב המלצות מותאמות-גיל."
            />
            <LegalDataItem
              icon={<ClipboardList className="w-4 h-4 text-emerald-600" />}
              title="מטרות ושאלון הצטרפות"
              what="מטרה עיקרית (ירידה במשקל / אורח חיים בריא), המכשול המרכזי וההסבר עליו, שעת היום הקשה ביותר עבורך, שעות שינה/יקיצה, זמני ארוחות וערוץ תקשורת מועדף."
              why="כדי לבנות עבורך מסע מותאם אישית, לתזמן תזכורות ברגעים הנכונים ולכוון את המנטור לצרכים שלך."
            />
            <LegalDataItem
              icon={<Brain className="w-4 h-4 text-emerald-600" />}
              title="הקשר אישי למנטור ה-AI"
              what="פרופיל הֶקְשֵׁר (ai_context), הנחיית מערכת אישית למנטור וזמני בדיקה יומיים מחושבים."
              why="כדי שהמנטור יזכור את ההקשר שלך וייתן ליווי רציף ועקבי לאורך זמן."
            />
          </LegalDataGrid>

          <h3>ג. נתוני בריאות ומדידות גוף — מידע רגיש</h3>
          <LegalCallout tone="warn" icon={<HeartPulse className="w-5 h-5" />}>
            הנתונים הבאים נחשבים <strong>מידע רגיש</strong> ומקבלים הגנה מוגברת. אנו אוספים אותם רק
            בהסכמתך ורק כדי לתת לך את הליווי שביקשת.
          </LegalCallout>
          <LegalDataGrid>
            <LegalDataItem
              icon={<HeartPulse className="w-4 h-4 text-emerald-600" />}
              title="מדידות גוף"
              what="משקל, גובה, BMI, אחוז שומן, היקף מותניים והיקף ירכיים, יעד משקל, ומדידות לאורך זמן עם הערות שתוסיף/י."
              why="כדי לעקוב אחר ההתקדמות שלך, להציג גרפים אישיים ולהתאים המלצות תזונה ופעילות."
            />
            <LegalDataItem
              icon={<HeartPulse className="w-4 h-4 text-emerald-600" />}
              title="העדפות ומצב בריאותי"
              what="רמת פעילות גופנית, העדפות תזונתיות, ומצבים בריאותיים שתבחר/י לשתף."
              why="כדי להימנע מהמלצות שאינן מתאימות לך ולהתאים את התוכן למגבלות וההעדפות שלך."
            />
          </LegalDataGrid>

          <h3>ד. שיחות ואינטראקציות עם מנטור ה-AI</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<MessageSquare className="w-4 h-4 text-emerald-600" />}
              title="היסטוריית שיחות"
              what="תוכן ההודעות שלך ושל המנטור, מזהה שיחה (session), סוג ההקשר (תזונה/מוטיבציה/שיעור וכו'), שם המודל שעיבד את הבקשה ומספר ה-tokens."
              why="כדי לספק תשובות רציפות ומותאמות, לשמור היסטוריה שתוכל/י לחזור אליה, ולנטר עלויות ואיכות."
            />
          </LegalDataGrid>

          <h3>ה. תוכניות, התקדמות ולמידה</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<ClipboardList className="w-4 h-4 text-emerald-600" />}
              title="תוכניות אישיות"
              what="תוכניות שבועיות/תזונה/אימון שנוצרו עבורך (ידנית או על-ידי AI), כולל משימות וארוחות."
              why="כדי להציג לך תוכנית פעולה מותאמת ולעקוב אחר ביצועה."
            />
            <LegalDataItem
              icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
              title="התקדמות במסע ובקורסים"
              what="שיעורים שהושלמו, התקדמות במשימות והרגלים, רצף ימים (streak), זמן שהייה בשיעור, תוצאות חידונים ומשחקים, והתחייבויות שלקחת."
              why="כדי לסמן היכן עצרת, להעניק תחושת הישג, ולהמליץ על הצעד הבא."
            />
            <LegalDataItem
              icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
              title="הישגים ותגים (Gamification)"
              what="תגים והישגים שצברת ותאריך קבלתם."
              why="כדי להגביר מוטיבציה ולחגוג אבני דרך."
            />
          </LegalDataGrid>

          <h3>ו. צפייה בווידאו ושימוש בתוכן</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<PlayCircle className="w-4 h-4 text-emerald-600" />}
              title="אירועי צפייה בווידאו"
              what="רישום כל התחלת צפייה בסרטון: הספק (Bunny/YouTube וכו'), מזהה הסרטון, אומדן משך הצפייה (ברירת מחדל ~3 דקות) וההקשר (מסע/קורס)."
              why="כדי לחשב עלויות תשתית וידאו, להבין אילו תכנים מועילים, ולשפר את התוכן. לא נעשה בכך שימוש פרסומי."
            />
          </LegalDataGrid>

          <h3>ז. תמיכה ברגעי משבר (Pre-Lapse Guardian / SOS) — מידע רגיש</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<LifeBuoy className="w-4 h-4 text-emerald-600" />}
              title="אירועי SOS"
              what="כאשר את/ה משתמש/ת ב״שומר״ ברגע קשה — נרשמים: קטגוריית הטריגר (רגשי/לוגיסטי/פיזיולוגי), האסטרטגיה שהוצעה, התוצאה (עבר/נפל/הוסלם), וסימון מצב מצוקה (red flag) אם זוהה."
              why={
                <>
                  כדי לתמוך בך טוב יותר בזמן אמת, ללמוד אילו אסטרטגיות עוזרות לך, למנוע שימוש כפייתי,
                  ולזהות מצבי מצוקה הדורשים הסלמה אנושית. ראה/י עמוד{' '}
                  <Link href="/safety">הבטיחות</Link>.
                </>
              }
            />
            <LegalDataItem
              icon={<Brain className="w-4 h-4 text-emerald-600" />}
              title="תובנות ו״תיק זיכרון״ של ה-AI"
              what="תובנות ומסקנות שהמערכת מגבשת מתוך האינטראקציות שלך כדי לזכור מה עובד עבורך, וכן אותות מעורבות (engagement) לשם זיהוי נטישה אפשרית."
              why="כדי לספק ליווי רציף וחכם יותר, ולפנות אליך מחדש בעדינות אם נעלמת לתקופה."
            />
          </LegalDataGrid>

          <h3>ח. התראות והעדפות</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<Bell className="w-4 h-4 text-emerald-600" />}
              title="התראות והעדפותיהן"
              what="היסטוריית התראות (תזכורות, הישגים, הודעות מנטור), סטטוס קריאה, העדפות התראה (push/דוא״ל/תזכורת יומית) ומונה התראות."
              why="כדי לשלוח לך תזכורות וליווי בערוצים שבחרת — ורק בהם."
            />
            <LegalDataItem
              icon={<Bell className="w-4 h-4 text-emerald-600" />}
              title="מנוי להתראות Push"
              what="פרטי המנוי הטכני של הדפדפן/המכשיר שלך (endpoint ומפתחות) — רק אם אישרת התראות Push."
              why="כדי לאפשר משלוח התראות דחיפה למכשירך. ניתן לבטל בכל עת בהגדרות הדפדפן."
            />
          </LegalDataGrid>

          <h3>ט. נתונים טכניים ותפעוליים</h3>
          <LegalDataGrid>
            <LegalDataItem
              icon={<Server className="w-4 h-4 text-emerald-600" />}
              title="נתוני שימוש ויומני שרת"
              what="זמן הפעילות האחרון שלך, נתוני בקשה טכניים (כתובת IP, סוג דפדפן ומכשיר) הנאספים אצל ספקי האירוח לצורך תפעול ואבטחה, ולוגים תפעוליים."
              why="כדי להפעיל את השירות, לאבחן תקלות, למנוע ניצול לרעה ולשמור על אבטחה."
            />
            <LegalDataItem
              icon={<Cookie className="w-4 h-4 text-emerald-600" />}
              title="עוגיות חיוניות"
              what="עוגיות הזדהות ושמירת מצב (session), ועוגיית אבטחה (CSP nonce) ייחודית לכל בקשה."
              why="הכרחיות לתפקוד השירות ולאבטחתו. איננו משתמשים בעוגיות פרסום צד-שלישי."
            />
          </LegalDataGrid>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="4" title="עוגיות (Cookies)">
          <p>
            אנו עושים שימוש <strong>בעוגיות חיוניות בלבד</strong>: עוגיות הזדהות לשמירת התחברות, ועוגיות
            אבטחה. <strong>איננו</strong> משתמשים בעוגיות פרסומיות או במעקב בין-אתרים. חסימת עוגיות
            חיוניות עלולה למנוע התחברות ושימוש תקין בשירות.
          </p>
        </LegalSection>

        <LegalSection num="5" title="כיצד אנו משתמשים במידע">
          <ul>
            <li>אספקת השירות, ההרשמה והתחזוקה של חשבונך.</li>
            <li>התאמה אישית של המסע, התוכן וההמלצות.</li>
            <li>הפעלת מנטור ה-AI ושמירת רצף השיחה.</li>
            <li>משלוח תזכורות, התראות והודעות תפעוליות בערוצים שבחרת.</li>
            <li>מעקב התקדמות, גרפים והישגים.</li>
            <li>תמיכה ברגעי משבר וזיהוי מצבי מצוקה.</li>
            <li>שיפור השירות, אבטחת מידע, מניעת הונאה ועמידה בדרישות הדין.</li>
          </ul>
        </LegalSection>

        <LegalSection num="6" title="עם מי המידע משותף — ספקי משנה">
          <p>
            איננו מוכרים את המידע שלך. אנו משתפים מידע רק עם ספקי שירות הכרחיים (&quot;ספקי משנה&quot;)
            הפועלים לפי הוראתנו ומחויבים בהסכמי סודיות ואבטחה. ככל הניתן, נשלח רק את המינימום הדרוש:
          </p>
          <LegalDataGrid>
            <LegalDataItem icon={<Server className="w-4 h-4 text-emerald-600" />} title="Supabase" what="מסד נתונים, אימות והרשאות, ואחסון." why="התשתית שבה נשמרים החשבון והנתונים שלך, באופן מאובטח ומבודד למשתמש." />
            <LegalDataItem icon={<Server className="w-4 h-4 text-emerald-600" />} title="Vercel" what="אירוח ואספקת האתר/האפליקציה." why="הרצת השירות ושליחתו לדפדפן שלך באמינות ובמהירות." />
            <LegalDataItem icon={<Brain className="w-4 h-4 text-emerald-600" />} title="OpenRouter / OpenAI" what="ספקי מודל הבינה המלאכותית (LLM) המעבדים את הודעות הצ׳אט שלך." why="יצירת תגובות מנטור ה-AI. נשלח אליהם תוכן ההודעה וההקשר הנדרש בלבד." />
            <LegalDataItem icon={<PlayCircle className="w-4 h-4 text-emerald-600" />} title="Bunny.net" what="רשת אספקת וידאו (CDN)." why="הזרמת סרטוני המסע והקורסים אליך." />
            <LegalDataItem icon={<Server className="w-4 h-4 text-emerald-600" />} title="Uploadthing / Cloudflare R2 / AWS S3" what="אחסון קבצי מדיה (אודיו, PDF, תמונות)." why="אחסון ואספקה של חומרי לימוד ונכסי מדיה." />
            <LegalDataItem icon={<Bell className="w-4 h-4 text-emerald-600" />} title="Resend" what="משלוח דוא״ל תפעולי (אימות, ברוכים הבאים)." why="שליחת הודעות חיוניות לתיבת הדוא״ל שלך." />
            <LegalDataItem icon={<Server className="w-4 h-4 text-emerald-600" />} title="Upstash" what="תזמון תהליכים ותורים (Workflow)." why="הפעלת תזכורות ותהליכים מתוזמנים ברקע." />
          </LegalDataGrid>
          <p>
            בנוסף, נחשוף מידע אם נידרש לכך על-פי דין, צו שיפוטי, או כדי להגן על זכויות, בטיחות וביטחון של
            המשתמשים ושלנו.
          </p>
        </LegalSection>

        <LegalSection num="7" title="העברת מידע מחוץ לישראל">
          <p>
            חלק מספקי המשנה מאחסנים או מעבדים מידע בשרתים מחוץ לישראל (לרבות באיחוד האירופי ובארה&quot;ב).
            במקרים אלה אנו פועלים להבטיח שההעברה תיעשה תוך הגנות מתאימות ובהתאם לדין החל.
          </p>
        </LegalSection>

        <LegalSection num="8" title="אבטחת מידע">
          <p>
            אנו מיישמים אמצעי אבטחה טכניים וארגוניים מחמירים — לרבות הצפנה, בקרת גישה ברמת השורה (RLS),
            מדיניות אבטחת תוכן (CSP) והפרדת הרשאות. פירוט מלא מופיע בעמוד <Link href="/safety">הבטיחות</Link>.
            עם זאת, אף מערכת אינה חסינה לחלוטין, ואיננו יכולים להבטיח אבטחה מוחלטת.
          </p>
        </LegalSection>

        <LegalSection num="9" title="כמה זמן נשמר המידע (Retention)">
          <p>
            אנו שומרים את המידע כל עוד חשבונך פעיל ולמשך הזמן הדרוש למטרות שלשמן נאסף, או כנדרש על-פי דין.
            עם מחיקת החשבון, נמחק או ננטרל את המידע האישי בתוך זמן סביר, למעט מידע שאנו מחויבים לשמור
            (למשל לצרכים חשבונאיים או משפטיים).
          </p>
        </LegalSection>
      </LegalCard>

      <LegalCard>
        <LegalSection num="10" title="הזכויות שלך">
          <p>בכפוף לדין, עומדות לך הזכויות הבאות ביחס למידע האישי שלך:</p>
          <ul>
            <li><strong>עיון</strong> — לקבל עותק של המידע השמור עליך.</li>
            <li><strong>תיקון</strong> — לתקן מידע שגוי או לא מעודכן (ניתן גם ישירות בפרופיל).</li>
            <li><strong>מחיקה</strong> — לבקש את מחיקת המידע ו/או החשבון.</li>
            <li><strong>הגבלה והתנגדות</strong> — להתנגד לעיבוד מסוים או להגבילו.</li>
            <li><strong>משיכת הסכמה</strong> — לבטל הסכמה (למשל להתראות או למידע רגיש) בכל עת.</li>
            <li><strong>ניידות</strong> — לקבל את המידע בפורמט נגיש ולהעבירו.</li>
          </ul>
          <p>
            למימוש זכויות אלה ניתן לפנות אל{' '}
            <a href="mailto:privacy@nurawell.ai">privacy@nurawell.ai</a>. נשתדל להשיב בתוך זמן סביר
            ובהתאם לדין.
          </p>
        </LegalSection>

        <LegalSection num="11" title="מחיקת חשבון">
          <p>
            תוכל/י לבקש את מחיקת חשבונך בכל עת. מחיקת החשבון תגרור מחיקה של הנתונים האישיים הקשורים אליו,
            למעט מידע שאנו מחויבים או רשאים לשמור על-פי דין. חלק מהנתונים עשויים להישמר בגיבויים לתקופה
            מוגבלת עד למחיקתם המלאה.
          </p>
        </LegalSection>

        <LegalSection num="12" title="פרטיות קטינים">
          <p>
            השירות אינו מיועד לילדים מתחת לגיל 16. איננו אוספים ביודעין מידע מקטינים מתחת לגיל זה. אם
            נודע לך כי קטין מסר לנו מידע — אנא פנה/י אלינו ונפעל למחיקתו.
          </p>
        </LegalSection>

        <LegalSection num="13" title="שינויים במדיניות">
          <p>
            אנו רשאים לעדכן מדיניות זו מעת לעת. הגרסה המעודכנת תפורסם בעמוד זה עם תאריך עדכון מעודכן.
            שינוי מהותי יובא לידיעתך באמצעים סבירים.
          </p>
        </LegalSection>

        <LegalSection num="14" title="יצירת קשר">
          <p>
            לשאלות בנושא פרטיות או למימוש זכויות, פנה/י אל ממונה הגנת הפרטיות:{' '}
            <a href="mailto:privacy@nurawell.ai">privacy@nurawell.ai</a>. הינך רשאי/ת גם לפנות לרשות
            להגנת הפרטיות במשרד המשפטים.
          </p>
        </LegalSection>
      </LegalCard>
    </LegalShell>
  );
}
