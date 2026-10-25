/**
 * סניטציה של HTML (תוכן שיעורים/אתגר) ו-SVG (QR) עם DOMPurify — פרסר DOM אמיתי, לא regex.
 * isomorphic-dompurify: בשרת (jsdom) ובלקוח (DOM של הדפדפן). ה-CSP עם nonce נשאר שכבה נוספת.
 */
import DOMPurify from 'isomorphic-dompurify';

const SAFE_URL = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // קישורים חיצוניים בטאב חדש בלי גישה ל-window.opener
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function sanitizeLessonHtml(html: string | null | undefined): string {
  if (!html) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'meta', 'link', 'base', 'math', 'svg'],
    FORBID_ATTR: ['formaction', 'action', 'srcset', 'ping'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URL,
  });
}

/** SVG שנוצר בשרת (קוד QR) — הגנה לעומק לפני הזרקה ל-DOM. */
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return '';
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ['script', 'foreignObject', 'a', 'use', 'image', 'animate', 'set'],
  });
}
