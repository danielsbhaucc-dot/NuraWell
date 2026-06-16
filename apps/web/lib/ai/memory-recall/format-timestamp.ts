/**
 * תווית זמן מדויקת לזיכרון — אזור ירושלים, לשימוש ב-recall ובתשובת המנטור.
 */

const TZ = 'Asia/Jerusalem';

export function formatMemoryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
