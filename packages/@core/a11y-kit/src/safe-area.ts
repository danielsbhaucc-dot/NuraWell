/**
 * אזור שמור לכפתור הצף + בדיקת חפיפה.
 * שורש הבעיה "הכפתור מכסה כפתור": הכפתור הצף יושב ב־position:fixed מעל תוכן שהמארח לא יודע עליו.
 * הפתרון בשתי שכבות:
 *  1. חוזה CSS: הערכה מפרסמת על <html> את --a11y-fab-reserve-block / --a11y-fab-reserve-inline,
 *     והמארח מרפד בהם תחתית של טפסים/סרגלים קבועים (או משתמש ב־fabReserveCss()).
 *  2. הרמה אוטומטית: אלמנטים קבועים/דביקים בתחתית ו־[data-a11y-avoid] נמדדים, והכפתור עולה מעליהם.
 * ובבדיקות: findFabOverlaps() מחזיר כל חפיפה — 0 זה התנאי לשחרור.
 */
export interface Box { left: number; top: number; right: number; bottom: number }

export const DEFAULT_AVOID = '[data-a11y-avoid], button[type="submit"], [data-a11y-primary]';

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return a.left < b.right + margin && a.right + margin > b.left && a.top < b.bottom + margin && a.bottom + margin > b.top;
}

export function fabReserve(size: number, gap: number): { block: number; inline: number } {
  return { block: size + gap * 2, inline: size + gap * 2 };
}

/** CSS למארח: מחלקה שמרפדת את התחתית בדיוק בגובה האזור השמור (כולל safe-area של המכשיר). */
export function fabReserveCss(cls = 'a11y-fab-safe'): string {
  if (!/^[a-zA-Z][\w-]{0,60}$/.test(cls)) throw new Error('invalid class');
  return `.${cls}{padding-block-end:calc(var(--a11y-fab-reserve-block, 88px) + var(--a11y-fab-lift, 0px) + env(safe-area-inset-bottom, 0px));}`;
}

/**
 * כמה להרים את הכפתור (px מעל המיקום הבסיסי) כדי שלא יחפוף אף מכשול.
 * fab: המלבן של הכפתור במיקום הבסיסי. מוגבל ל־maxLift כדי שלא יברח מהמסך.
 */
export function liftToClear(fab: Box, obstacles: Box[], gap: number, maxLift: number): number {
  let lift = 0;
  for (let i = 0; i < 8; i++) {
    const cur: Box = { ...fab, top: fab.top - lift, bottom: fab.bottom - lift };
    const hits = obstacles.filter((o) => boxesOverlap(cur, o, gap / 2));
    if (!hits.length) return lift;
    const need = Math.max(...hits.map((o) => cur.bottom - o.top + gap / 2));
    lift += Math.max(1, Math.ceil(need));
    if (lift > maxLift) return maxLift;
  }
  return Math.min(lift, maxLift);
}

const visible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
};

/** מכשולים: [data-a11y-avoid]/submit/ראשי + כל אלמנט fixed/sticky שנוגע בחצי התחתון של המסך. */
export function collectObstacles(doc: Document, avoid = DEFAULT_AVOID, rootId = 'ca11y-root'): Box[] {
  const out: Box[] = [];
  const vh = doc.defaultView?.innerHeight ?? 800;
  const skip = (el: Element) => !!el.closest(`#${rootId}`);
  for (const el of Array.from(doc.querySelectorAll(avoid))) if (!skip(el) && visible(el)) out.push(el.getBoundingClientRect());
  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    if (skip(el)) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh / 2 && r.height < vh * 0.6 && visible(el)) {
      // מכשול = הילדים האינטראקטיביים שלו (סרגל רחב לא אמור לדחוף אם יש בו רווח ריק מול הכפתור)
      const kids = Array.from(el.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]')).filter(visible);
      if (kids.length) for (const k of kids) out.push(k.getBoundingClientRect());
      else out.push(r);
    }
  }
  return out;
}

export interface Overlap { selector: string; text: string; fab: Box; other: Box }

const pinned = (el: Element): boolean => {
  for (let n: Element | null = el; n && n !== n.ownerDocument.body; n = n.parentElement) {
    const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true;
  }
  return el.matches('[data-a11y-avoid]');
};

/**
 * עוזר לבדיקות (Playwright/jsdom): כל אלמנט אינטראקטיבי גלוי שהכפתור הצף חופף.
 * ריק ⇒ תקין. נקרא בתוך הדף (page.evaluate) או ב־jsdom.
 * pinnedOnly: רק אלמנטים קבועים/דביקים/[data-a11y-avoid] — אלה שהגלילה לא מזיזה ולכן חייבים להיות פנויים בכל מצב.
 * בלי pinnedOnly: הכול — להריץ אחרי גלילה לסוף הדף, כדי לוודא שהריפוד השמור (.a11y-fab-safe) מספיק.
 */
export function findFabOverlaps(doc: Document, opts: { fab?: string; targets?: string; margin?: number; pinnedOnly?: boolean } = {}): Overlap[] {
  const fab = doc.querySelector(opts.fab ?? '#ca11y-root .ca11y-fab');
  if (!fab || !visible(fab)) return [];
  const fr = fab.getBoundingClientRect();
  const sel = opts.targets ?? 'a[href],button,input,select,textarea,[role="button"],[role="link"],[data-a11y-avoid]';
  const out: Overlap[] = [];
  for (const el of Array.from(doc.querySelectorAll(sel))) {
    if (el.closest('#ca11y-root') || !visible(el) || (opts.pinnedOnly && !pinned(el))) continue;
    const r = el.getBoundingClientRect();
    if (boxesOverlap(fr, r, opts.margin ?? 0)) {
      const id = el.id ? `#${el.id}` : el.tagName.toLowerCase();
      out.push({ selector: id, text: (el.textContent ?? '').trim().slice(0, 40), fab: fr, other: r });
    }
  }
  return out;
}
