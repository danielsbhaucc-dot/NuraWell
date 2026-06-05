/**
 * סניטציה של HTML מהמסד (תוכן שיעור). ללא תלות חיצונית — מתאים גם כש־npm חסום (TLS).
 * בשימוש בצד שרת (lessons page) ובצד לקוח (LessonPageClient) — הגנה לעומק.
 */
export function sanitizeLessonHtml(html: string | null | undefined): string {
  if (!html) return '';

  let s = html.replace(/<!--[\s\S]*?-->/g, '');

  for (let i = 0; i < 4; i++) {
    s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
    s = s.replace(/<embed\b[^>]*>/gi, '');
  }

  s = s.replace(/<\/?(?:script|iframe|object|embed|applet|meta|link|base)\b[^>]*>/gi, '');

  s = s.replace(/\s(?:on[a-z]{3,}|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ');
  s = s.replace(/\s(?:href|src|xlink:href)\s*=\s*(?:"|'|\s)*(?:javascript:|vbscript:)/gi, ' ');
  s = s.replace(/\s(?:href|src)\s*=\s*(?:"|'|\s)*data:/gi, ' ');

  return s;
}
