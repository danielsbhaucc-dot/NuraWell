/**
 * תצוגת מונה התראות — ויזואלית ו-a11y חייבים להיות מסונכרנים.
 * מעל 99 מציגים "99+" (ולא "9+" מול מספר מלא ב-aria).
 */

export const UNREAD_BADGE_CAP = 99;

export function formatUnreadBadgeCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count > UNREAD_BADGE_CAP) return `${UNREAD_BADGE_CAP}+`;
  return String(Math.floor(count));
}

/** שם נגיש לכפתור הפעמון — תואם את הטקסט הוויזואלי של התג. */
export function formatUnreadBellAriaLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'התראות';
  return `התראות, ${formatUnreadBadgeCount(count)} שלא נקראו`;
}
