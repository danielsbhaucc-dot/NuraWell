import { LEGAL_SUPPORT_EMAIL } from '@/lib/legal/contact';
/**
 * שלד מייל משותף (כיוון B: חם וצבעוני, בפלטת המותג).
 * RTL עמיד ל-Gmail: dir=rtl + align=right על כל table/td, text-align inline, בלי <style>,
 * גרדיאנט עם bgcolor כגיבוי, בלי margin שלילי, כפתור VML ל-Outlook.
 * בלי תלות בקבצים אחרים: משמש גם לתבניות ה-Auth של Supabase (scripts/build-auth-email-templates.ts).
 */

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Hebrew',Heebo,Rubik,'Segoe UI',Arial,Helvetica,sans-serif";

/** צבעים מ-globals.css + הזהב של הלוגו. אין לבן טהור: קרם במקום. */
export const EMAIL_COLORS = {
  page: '#f3f8f0',
  card: '#f7fbf4',
  cream: '#fbf7ec',
  soft: '#f5faf2',
  ink: '#1a2e23',
  secondary: '#4a6354',
  muted: '#7a9185',
  brand: '#0f3d2e',
  brand700: '#0b6b4b',
  leaf: '#6fc49a',
  gold: '#c9a24a',
  goldSoft: '#f6ecd2',
  line: '#e2ebe5',
};
const C = EMAIL_COLORS;

export type EmailLayoutInput = {
  preheader: string;
  /** תווית קטנה מעל הכותרת */
  eyebrow?: string;
  heading: string;
  /** שורת משנה בכותרת */
  subheading?: string;
  /** כרטיס פתיחה שיושב "על" ההדר (בסגנון B) */
  introHtml?: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  afterCtaHtml?: string;
  /** חתימה אישית (HTML) */
  signatureHtml?: string;
  /** כתובת תמיכה לשורת "התיבה לא נבדקת" */
  supportEmail?: string;
  /** בסיס לנכסים (https://...) או {{ .SiteURL }} */
  assetOrigin: string;
};

export const EMAIL_SUPPORT_ADDRESS = LEGAL_SUPPORT_EMAIL;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const td = (style: string, inner: string, extra = '') =>
  `<td dir="rtl" align="right"${extra} style="direction:rtl;text-align:right;${style}">${inner}</td>`;
const table = (inner: string, style = '', extra = '') =>
  `<table role="presentation" dir="rtl" align="right" width="100%" cellpadding="0" cellspacing="0" border="0"${extra} style="direction:rtl;${style}">${inner}</table>`;

export function emailParagraph(html: string, opts: { muted?: boolean; small?: boolean; center?: boolean } = {}): string {
  const color = opts.muted ? C.secondary : C.ink;
  const size = opts.small ? 14 : 16;
  const align = opts.center ? 'center' : 'right';
  return `<p dir="rtl" align="${align}" style="margin:0 0 16px;color:${color};font-family:${EMAIL_FONT};font-size:${size}px;line-height:1.7;direction:rtl;text-align:${align}">${html}</p>`;
}

/** קופסה חמה (זהב רך) להערות */
export function emailNotice(html: string): string {
  return table(
    `<tr>${td(`background:${C.goldSoft};border:0.5px solid ${C.gold};border-radius:18px;padding:14px 18px;color:${C.brand};font-family:${EMAIL_FONT};font-size:14px;line-height:1.6`, html, ` bgcolor="${C.goldSoft}"`)}</tr>`,
    'margin:0 0 20px'
  );
}

/** טבלת סיכום תווית/ערך */
export function emailSummaryTable(rows: Array<[string, string]>, title?: string): string {
  const trs = rows
    .map(([k, v], i) => {
      const b = i ? `border-top:0.5px solid #e6dfcc;` : '';
      return `<tr>${td(`${b}padding:14px 18px;width:42%;color:${C.muted};font-family:${EMAIL_FONT};font-size:15px;line-height:1.4`, k, ' valign="top"')}${td(`${b}padding:14px 18px;color:${C.ink};font-family:${EMAIL_FONT};font-size:15px;line-height:1.4;font-weight:600`, v, ' valign="top"')}</tr>`;
    })
    .join('');
  const head = title
    ? `<p dir="rtl" align="right" style="margin:6px 4px 8px;color:${C.muted};font-family:${EMAIL_FONT};font-size:13px;font-weight:600;letter-spacing:0.3px;direction:rtl;text-align:right">${title}</p>`
    : '';
  return head + table(trs, `background:${C.cream};border:0.5px solid #e6dfcc;border-radius:18px;border-collapse:separate;margin:0 0 28px;box-shadow:0 1px 3px rgba(15,61,46,0.06)`, ` bgcolor="${C.cream}"`);
}

/** קו מפריד עדין (hairline) בין קטעים */
export function emailDivider(): string {
  return table(`<tr><td height="1" style="height:1px;line-height:1px;font-size:0;padding:0;border-top:1px solid #ecdfbd">&nbsp;</td></tr>`, 'margin:6px 0 22px');
}

/** קוד חד-פעמי גדול וקריא */
export function emailCode(code: string): string {
  return table(
    `<tr><td dir="ltr" align="center" bgcolor="${C.goldSoft}" style="background:${C.goldSoft};border:1px solid ${C.gold};border-radius:22px;padding:18px 8px;box-shadow:0 1px 3px rgba(15,61,46,0.08);text-align:center"><span dir="ltr" style="font-family:'Courier New',Consolas,monospace;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:5px;color:${C.brand};white-space:nowrap">${code}</span></td></tr>`,
    'margin:4px 0 20px'
  );
}

function button(label: string, url: string): string {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:10px auto 24px"><tr><td align="center" bgcolor="${C.brand700}" style="border-radius:27px;background:${C.brand700};box-shadow:0 6px 16px rgba(11,107,75,0.28)">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:260px" arcsize="50%" stroke="f" fillcolor="${C.brand700}"><w:anchorlock/><center style="color:${C.cream};font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${url}" target="_blank" style="display:inline-block;padding:0 42px;height:54px;line-height:54px;font-family:${EMAIL_FONT};font-size:17px;font-weight:700;color:${C.cream};text-decoration:none;border-radius:26px;background:${C.brand700}">${label}</a><!--<![endif]-->
</td></tr></table>`;
}

export function emailFallbackLink(url: string): string {
  return emailParagraph(
    `הכפתור התעצל? אפשר להעתיק את הקישור הזה לדפדפן:<br><a href="${url}" dir="ltr" style="color:${C.brand700};word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;text-decoration:underline;font-size:12px">${url}</a>`,
    { muted: true, small: true }
  );
}

/** פתק אישי מדולב (בסגנון B) */
export function dolevSignature(line: string): string {
  const text = `<strong style="color:${C.brand};font-size:16px">דולב</strong> 👋<br>${line}`;
  return table(
    `<tr>${td(`padding:18px 20px;background:${C.goldSoft};border-radius:22px;box-shadow:0 1px 3px rgba(15,61,46,0.06);font-family:${EMAIL_FONT};font-size:15px;line-height:1.6;color:${C.secondary}`, text, ` bgcolor="${C.goldSoft}"`)}</tr>`,
    'border-collapse:separate;margin:24px 0 0'
  );
}

export function renderEmailLayout(i: EmailLayoutInput): string {
  const origin = i.assetOrigin.replace(/\/$/, '');
  const support = i.supportEmail ?? EMAIL_SUPPORT_ADDRESS;
  // שורת לוגו בצבע אחיד = רקע ה-PNG (#0f3d2e אפוי), כך שאין "קופסה" גם כשהגרדיאנט נתמך; הגרדיאנט מתחיל מאותו צבע בשורה הבאה.
  const header = `<tr><td dir="rtl" align="center" bgcolor="${C.brand}" style="direction:rtl;text-align:center;background-color:${C.brand};border-radius:34px 34px 0 0;padding:28px 18px 0">
<a href="${origin}" target="_blank" style="text-decoration:none;color:${C.cream}"><img src="${origin}/brand/email-logo-header.png" width="224" height="51" alt="NuraWell" style="display:block;margin:0 auto;border:0;outline:none;width:224px;height:auto;max-width:224px;background-color:${C.brand};color:${C.cream};font-family:${EMAIL_FONT};font-size:26px;line-height:51px;font-weight:700;text-align:center"></a>
</td></tr>
<tr><td dir="rtl" align="center" bgcolor="${C.brand700}" background="${origin}/brand/email-header-grad.png" style="direction:rtl;text-align:center;background-color:${C.brand700};background-image:url('${origin}/brand/email-header-grad.png');background-repeat:repeat-x;background-position:top center;padding:16px 18px ${i.introHtml ? '24px' : '34px'}">
${i.eyebrow ? `<p dir="rtl" align="center" style="margin:0 0 10px;font-family:${EMAIL_FONT};direction:rtl;text-align:center"><span style="display:inline-block;background:${C.gold};color:${C.brand};font-size:12px;font-weight:800;padding:5px 14px;border-radius:999px">${i.eyebrow}</span></p>` : ''}
<h1 dir="rtl" align="center" style="margin:0;color:${C.cream};font-family:${EMAIL_FONT};font-size:31px;line-height:1.3;font-weight:800;direction:rtl;text-align:center">${i.heading}</h1>
${i.subheading ? `<p dir="rtl" align="center" style="margin:10px 0 0;color:#d6ecdf;font-family:${EMAIL_FONT};font-size:17px;line-height:1.5;font-weight:500;direction:rtl;text-align:center">${i.subheading}</p>` : ''}
</td></tr>`;
  // "חפיפה" בטוחה ל-Gmail: שורה שחצייה העליון בצבע ההדר והתחתון בצבע הגוף, והכרטיס יושב באמצע (בלי margin שלילי).
  const intro = i.introHtml
    ? `<tr><td dir="rtl" align="center" bgcolor="${C.card}" style="direction:rtl;background-color:${C.card};background-image:url('${origin}/brand/email-header-tab.png');background-repeat:repeat-x;background-position:top center;padding:0 12px" background="${origin}/brand/email-header-tab.png">
${table(`<tr>${td(`background:${C.cream};border:1px solid #e6e1d3;border-top:4px solid ${C.gold};border-bottom:3px solid #d9cba4;border-radius:28px;padding:20px 18px 6px;box-shadow:0 2px 4px rgba(15,61,46,0.10),0 18px 40px rgba(15,61,46,0.28)`, i.introHtml, ` bgcolor="${C.cream}"`)}</tr>`, 'border-collapse:separate')}
<img src="${origin}/brand/email-card-shadow.png" width="100%" height="18" alt="" style="display:block;width:100%;height:18px;border:0;outline:none;margin:0 auto">
</td></tr>`
    : `<tr><td height="4" bgcolor="${C.gold}" style="height:4px;line-height:4px;font-size:0;background:${C.gold}">&nbsp;</td></tr>`;
  const body = `<tr>${td(`background:${C.card};border-radius:0 0 34px 34px;padding:${i.introHtml ? '10px' : '28px'} 18px 30px`, `${i.bodyHtml}${i.cta ? button(i.cta.label, i.cta.url) : ''}${i.afterCtaHtml ? emailDivider() + i.afterCtaHtml : ''}${i.signatureHtml ?? ''}`, ` bgcolor="${C.card}"`)}</tr>`;
  const footer = `<tr><td dir="rtl" align="center" style="direction:rtl;text-align:center;padding:24px 18px 0">
<div style="width:44px;height:4px;border-radius:2px;background:${C.gold};opacity:0.55;margin:0 auto 16px;font-size:0;line-height:0">&nbsp;</div>
<p dir="rtl" align="center" style="margin:0 0 6px;color:${C.muted};font-family:${EMAIL_FONT};font-size:13px;line-height:1.65;direction:rtl;text-align:center">את התיבה הזאת אף אחד לא קורא (גם לא דולב 🙈), אז תשובות לכאן לא יגיעו.<br>יש שאלה? כתבו לנו ל-<a href="mailto:${support}" dir="ltr" style="color:${C.brand700};text-decoration:underline">${support}</a> ונחזור אליכם.</p>
<p dir="rtl" align="center" style="margin:0;color:${C.muted};font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;direction:rtl;text-align:center">NuraWell <span style="color:${C.gold}">·</span> ליווי אישי לאורח חיים בריא</p>
</td></tr>`;
  return `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${i.heading}</title>
</head>
<body dir="rtl" bgcolor="${C.page}" style="margin:0;padding:0;background:${C.page};direction:rtl;text-align:right;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${i.preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" dir="rtl" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="direction:rtl;background:${C.page}"><tr><td dir="rtl" align="center" style="direction:rtl;padding:16px 4px">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" dir="rtl" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;max-width:600px;width:100%;margin:0 auto;table-layout:fixed">
${header}
${intro}
${body}
${footer}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}
