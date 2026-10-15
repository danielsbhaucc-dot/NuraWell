/**
 * שלד מייל משותף — RTL, טבלאות, inline styles בלבד (Gmail/Outlook/Apple Mail).
 * בלי תלות בקבצים אחרים: משמש גם ליצירת תבניות ה-Auth של Supabase (scripts/build-auth-email-templates.ts).
 */

export const EMAIL_FONT = "Rubik,Heebo,'Segoe UI',Arial,Helvetica,sans-serif";

const C = {
  page: '#eef5ec',
  card: '#ffffff',
  ink: '#1a2e23',
  muted: '#5b6b62',
  faint: '#8a978f',
  brand: '#0f3d2e',
  leaf: '#6fc49a',
  button: '#0f6e4f',
  line: '#dfe9e1',
  soft: '#f3f8f0',
};

export type EmailLayoutInput = {
  /** טקסט תצוגה מקדימה בתיבת הדואר */
  preheader: string;
  /** תווית קטנה מעל הכותרת, למשל "אלמוג · NuraWell" */
  eyebrow?: string;
  heading: string;
  /** HTML פנימי (פסקאות מ-emailParagraph וכו׳) */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** HTML אחרי הכפתור (קישור חלופי, הערות) */
  afterCtaHtml?: string;
  footerNote?: string;
  /** בסיס לכתובת הלוגו (https://...) או ביטוי תבנית כמו {{ .SiteURL }} */
  assetOrigin: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function emailParagraph(html: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const color = opts.muted ? C.muted : C.ink;
  const size = opts.small ? 14 : 16;
  return `<p dir="rtl" style="margin:0 0 16px;color:${color};font-family:${EMAIL_FONT};font-size:${size}px;line-height:1.65;direction:rtl;text-align:right">${html}</p>`;
}

export function emailNotice(html: string): string {
  return `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;direction:rtl"><tr><td dir="rtl" align="right" style="background:#fff7e6;border:1px solid #f5c26b;border-radius:10px;padding:12px 14px;color:#7a4b00;font-family:${EMAIL_FONT};font-size:14px;line-height:1.5;font-weight:600;direction:rtl;text-align:right">${html}</td></tr></table>`;
}

/** טבלת סיכום תווית/ערך */
export function emailSummaryTable(rows: Array<[string, string]>): string {
  const trs = rows
    .map(
      ([k, v], i) =>
        `<tr><td dir="rtl" align="right" valign="top" style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.muted};font-family:${EMAIL_FONT};font-size:14px;line-height:1.4;direction:rtl;text-align:right;width:40%">${k}</td><td dir="rtl" align="right" valign="top" style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.brand};font-family:${EMAIL_FONT};font-size:14px;line-height:1.4;font-weight:600;direction:rtl;text-align:right">${v}</td></tr>`
    )
    .join('');
  return `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${C.soft};border:1px solid ${C.line};border-radius:12px;border-collapse:separate;direction:rtl">${trs}</table>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 20px"><tr><td align="center" bgcolor="${C.button}" style="border-radius:10px;background:${C.button}"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${EMAIL_FONT};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;
}

export function renderEmailLayout(i: EmailLayoutInput): string {
  const origin = i.assetOrigin.replace(/\/$/, '');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${i.heading}</title>
</head>
<body dir="rtl" style="margin:0;padding:0;background:${C.page};direction:rtl;text-align:right;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${i.preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};direction:rtl">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;direction:rtl">
<tr><td align="center" style="padding:0 0 18px">
<a href="${origin}" target="_blank" style="text-decoration:none"><img src="${origin}/icon-192.png" width="44" height="44" alt="NuraWell" style="display:block;margin:0 auto;border:0;border-radius:12px"></a>
<div style="margin-top:8px;font-family:${EMAIL_FONT};font-size:17px;font-weight:700;color:${C.brand};letter-spacing:0.3px" dir="ltr">NuraWell</div>
</td></tr>
<tr><td dir="rtl" align="right" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:32px 28px;direction:rtl;text-align:right">
${i.eyebrow ? `<p dir="rtl" style="margin:0 0 6px;color:${C.button};font-family:${EMAIL_FONT};font-size:13px;font-weight:700;direction:rtl;text-align:right">${i.eyebrow}</p>` : ''}
<h1 dir="rtl" style="margin:0 0 18px;color:${C.brand};font-family:${EMAIL_FONT};font-size:24px;line-height:1.35;font-weight:700;direction:rtl;text-align:right">${i.heading}</h1>
${i.bodyHtml}
${i.cta ? button(i.cta.label, i.cta.url) : ''}
${i.afterCtaHtml ?? ''}
</td></tr>
<tr><td dir="rtl" align="center" style="padding:20px 16px 0;direction:rtl;text-align:center">
<p dir="rtl" style="margin:0 0 6px;color:${C.faint};font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;direction:rtl;text-align:center">${i.footerNote ?? 'NuraWell · ליווי אישי לאורח חיים בריא'}</p>
<p dir="rtl" style="margin:0;color:${C.faint};font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;direction:rtl;text-align:center">זה מייל אוטומטי, אין צורך להשיב אליו.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** קישור חלופי כשהכפתור לא עובד */
export function emailFallbackLink(url: string): string {
  return emailParagraph(
    `אם הכפתור לא עובד, אפשר להעתיק את הקישור הזה לדפדפן:<br><a href="${url}" dir="ltr" style="color:${C.button};word-break:break-all;text-decoration:underline">${url}</a>`,
    { muted: true, small: true }
  );
}
