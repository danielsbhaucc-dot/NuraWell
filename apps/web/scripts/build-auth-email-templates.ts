/**
 * יוצר את תבניות ה-Auth של Supabase מהשלד המשותף (lib/email/layout.ts).
 * הרצה: npx jiti apps/web/scripts/build-auth-email-templates.ts
 * פלט: supabase/templates/*.html + subjects.json. מוחלים דרך Management API.
 * נוסח ניטרלי-מגדר (רבים): ב-user_metadata אין gender, ותנאי Go על שדה חסר מסוכן.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dolevSignature, emailCode, emailFallbackLink, emailNotice, emailParagraph, renderEmailLayout } from '@/lib/module-api/notifications/lib-email-layout';

const URL_VAR = '{{ .ConfirmationURL }}';
const SITE = '{{ .SiteURL }}';
const CODE = '{{ .Token }}';

type T = {
  key: string;
  subject: string;
  preheader: string;
  heading: string;
  subheading?: string;
  body: string[];
  code?: boolean;
  cta?: string;
  note?: string;
  sign: string;
};

export const AUTH_TEMPLATES: T[] = [
  {
    key: 'confirmation',
    subject: 'רגע לפני שמתחילים: אישור המייל ב-NuraWell',
    preheader: 'לחיצה אחת קטנה, ואנחנו יוצאים לדרך',
    heading: 'כמעט בפנים! 🌿',
    subheading: 'נשאר רק לאשר שזה באמת המייל שלכם',
    body: ['היי, כאן דולב. שמחתי לראות שנרשמתם! לפני שנתחיל, צריך לוודא שהמייל הזה באמת שלכם ולא של השכן. לחיצה על הכפתור וזהו.'],
    cta: 'אישור המייל',
    note: 'לא נרשמתם ל-NuraWell? כנראה מישהו התבלבל בכתובת. אפשר פשוט להתעלם מהמייל, שום דבר לא יקרה.',
    sign: 'מחכה לכם בצד השני',
  },
  {
    key: 'magic_link',
    subject: 'הקוד שלכם לכניסה ל-NuraWell',
    preheader: 'קוד חד-פעמי (וגם קישור, למי שממהר)',
    heading: 'הקוד שלכם מוכן 🔑',
    subheading: 'בלי סיסמאות, בלי כאב ראש',
    body: ['ביקשתם להיכנס? הנה הקוד. מקלידים אותו באפליקציה, או לוחצים על הכפתור, מה שנוח יותר.'],
    code: true,
    cta: 'כניסה בלחיצה',
    note: 'הקוד והקישור תקפים לזמן קצר ולשימוש אחד. אם לא ביקשתם להיכנס, אפשר להתעלם. בלי הקוד אף אחד לא נכנס.',
    sign: 'שומר על הדלת בשבילכם',
  },
  {
    key: 'recovery',
    subject: 'איפוס הסיסמה ב-NuraWell',
    preheader: 'קורה לכולם, הנה קישור לסיסמה חדשה',
    heading: 'שכחתם סיסמה? קורה לכולם',
    subheading: 'בוחרים חדשה תוך דקה',
    body: ['קיבלנו בקשה לאפס את הסיסמה שלכם. לוחצים על הכפתור, בוחרים סיסמה חדשה, וחוזרים לעניינים.'],
    cta: 'בחירת סיסמה חדשה',
    note: 'לא ביקשתם לאפס? אפשר להתעלם מהמייל, והסיסמה הנוכחית נשארת כמו שהיא.',
    sign: 'גם אני שוכח סיסמאות, אל דאגה',
  },
  {
    key: 'email_change',
    subject: 'אישור כתובת המייל החדשה ב-NuraWell',
    preheader: 'צריך רק לאשר את הכתובת החדשה',
    heading: 'מחליפים כתובת? 📬',
    subheading: 'עוד לחיצה אחת ומסיימים',
    body: [
      'ביקשתם להחליף את כתובת המייל בחשבון מ-<span dir="ltr">{{ .Email }}</span> ל-<span dir="ltr">{{ .NewEmail }}</span>.',
      'כדי שנדע שזה באמת אתם, צריך לאשר בלחיצה על הכפתור.',
    ],
    cta: 'אישור הכתובת החדשה',
    note: 'לא ביקשתם את השינוי? אל תלחצו על הכפתור, ומומלץ להחליף סיסמה ליתר ביטחון.',
    sign: 'דואג שהמיילים יגיעו למקום הנכון',
  },
  {
    key: 'invite',
    subject: 'הוזמנתם ל-NuraWell 🌿',
    preheader: 'מישהו חשב עליכם, וההזמנה מחכה',
    heading: 'יש לכם הזמנה! 🎉',
    subheading: 'ליווי אישי לאורח חיים בריא, בקצב שלכם',
    body: ['היי, כאן דולב. מישהו חשב עליכם והזמין אתכם להצטרף ל-NuraWell. מבטיח שזה יותר כיף מזה שזה נשמע.'],
    cta: 'קבלת ההזמנה',
    note: 'לא ציפיתם להזמנה? אפשר פשוט להתעלם מהמייל.',
    sign: 'שומר לכם מקום',
  },
  {
    key: 'reauthentication',
    subject: 'קוד האימות שלכם ב-NuraWell',
    preheader: 'קוד חד-פעמי לאישור הפעולה',
    heading: 'רק מוודאים שזה אתם 🔐',
    subheading: 'קוד קצר, וממשיכים',
    body: ['כדי לאשר את הפעולה בחשבון, מקלידים את הקוד הזה באפליקציה:'],
    code: true,
    note: 'הקוד תקף לזמן קצר. לא ביקשתם? אפשר להתעלם, ובלי הקוד שום דבר לא משתנה.',
    sign: 'קצת זהיר, אבל זה בשבילכם',
  },
];

export function renderAuthTemplate(t: T): { html: string } {
  const html = renderEmailLayout({
    assetOrigin: SITE,
    preheader: t.preheader,
    eyebrow: 'דולב · NuraWell',
    heading: t.heading,
    subheading: t.subheading,
    introHtml: emailParagraph(t.body[0]),
    bodyHtml: t.body.slice(1).map((b) => emailParagraph(b)).join('') + (t.code ? emailCode(CODE) : ''),
    cta: t.cta ? { label: t.cta, url: URL_VAR } : undefined,
    afterCtaHtml: (t.cta ? emailFallbackLink(URL_VAR) : '') + (t.note ? emailNotice(t.note) : ''),
    signatureHtml: dolevSignature(t.sign),
  });
  return { html };
}

function main() {
  const out = join(__dirname, '../../../supabase/templates');
  mkdirSync(out, { recursive: true });
  const subjects: Record<string, string> = {};
  for (const t of AUTH_TEMPLATES) {
    writeFileSync(join(out, `${t.key}.html`), renderAuthTemplate(t).html);
    subjects[t.key] = t.subject;
  }
  writeFileSync(join(out, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n');
  console.log('wrote', AUTH_TEMPLATES.length, 'templates to', out);
}

main();
