/**
 * יוצר את תבניות ה-Auth של Supabase מהשלד המשותף (lib/email/layout.ts).
 * הרצה: npx jiti apps/web/scripts/build-auth-email-templates.ts
 * פלט: supabase/templates/*.html (+ subjects.json). מוחלים ב-Management API / Dashboard.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { emailFallbackLink, emailParagraph, renderEmailLayout } from '../lib/email/layout';

const URL_VAR = '{{ .ConfirmationURL }}';
const SITE = '{{ .SiteURL }}';

type T = { key: string; subject: string; preheader: string; heading: string; body: string[]; cta: string; after?: string };

const ignore = 'אם לא ביקשת את זה, אפשר פשוט להתעלם מהמייל הזה. שום דבר לא ישתנה בחשבון שלך.';

export const AUTH_TEMPLATES: T[] = [
  {
    key: 'confirmation',
    subject: 'אישור כתובת המייל שלך ב-NuraWell',
    preheader: 'עוד לחיצה אחת ומתחילים',
    heading: 'ברוכים הבאים ל-NuraWell 🌿',
    body: ['איזה כיף שהצטרפת! כדי להתחיל, צריך רק לאשר שזו כתובת המייל שלך.'],
    cta: 'אישור המייל',
    after: ignore,
  },
  {
    key: 'magic_link',
    subject: 'קישור הכניסה שלך ל-NuraWell',
    preheader: 'לחיצה אחת ואתה בפנים',
    heading: 'כניסה ל-NuraWell',
    body: ['ביקשת להיכנס לחשבון. הקישור תקף לזמן קצר ולשימוש אחד בלבד.'],
    cta: 'כניסה לחשבון',
    after: ignore,
  },
  {
    key: 'recovery',
    subject: 'איפוס הסיסמה שלך ב-NuraWell',
    preheader: 'קישור לבחירת סיסמה חדשה',
    heading: 'איפוס סיסמה',
    body: ['קיבלנו בקשה לאפס את הסיסמה לחשבון שלך. בלחיצה על הכפתור אפשר לבחור סיסמה חדשה.'],
    cta: 'בחירת סיסמה חדשה',
    after: 'אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהמייל. הסיסמה הנוכחית נשארת כמו שהיא.',
  },
  {
    key: 'email_change',
    subject: 'אישור החלפת כתובת המייל ב-NuraWell',
    preheader: 'צריך לאשר את הכתובת החדשה',
    heading: 'החלפת כתובת מייל',
    body: [
      'ביקשת להחליף את כתובת המייל בחשבון מ-<span dir="ltr">{{ .Email }}</span> ל-<span dir="ltr">{{ .NewEmail }}</span>.',
      'כדי להשלים את ההחלפה, צריך לאשר בלחיצה על הכפתור.',
    ],
    cta: 'אישור הכתובת החדשה',
    after: 'אם לא ביקשת את השינוי, אל תלחץ על הכפתור, ומומלץ להחליף סיסמה.',
  },
  {
    key: 'invite',
    subject: 'הוזמנת להצטרף ל-NuraWell',
    preheader: 'ההזמנה שלך מחכה',
    heading: 'הוזמנת ל-NuraWell 🌿',
    body: ['מישהו הזמין אותך להצטרף ל-NuraWell, ליווי אישי לאורח חיים בריא, בקצב שלך.'],
    cta: 'קבלת ההזמנה',
    after: 'אם לא ציפית להזמנה, אפשר להתעלם מהמייל.',
  },
  {
    key: 'reauthentication',
    subject: 'קוד האימות שלך ב-NuraWell',
    preheader: 'קוד חד-פעמי לאישור הפעולה',
    heading: 'קוד אימות',
    body: [
      'זה הקוד לאישור הפעולה בחשבון שלך:',
      '<span dir="ltr" style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;color:#0f3d2e">{{ .Token }}</span>',
    ],
    cta: '',
    after: ignore,
  },
];

export function renderAuthTemplate(t: T): { html: string } {
  const html = renderEmailLayout({
    assetOrigin: SITE,
    preheader: t.preheader,
    heading: t.heading,
    bodyHtml: t.body.map((b) => emailParagraph(b)).join(''),
    cta: t.cta ? { label: t.cta, url: URL_VAR } : undefined,
    afterCtaHtml: (t.cta ? emailFallbackLink(URL_VAR) : '') + (t.after ? emailParagraph(t.after, { muted: true, small: true }) : ''),
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
