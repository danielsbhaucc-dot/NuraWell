function truncatePreview(text: string, max = 88): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** כותרת לרשימת שיחות — טהור, בטוח ל-client bundle */
export function buildChatSessionListTitle(item: {
  summary: string | null;
  preview_text: string | null;
  created_at: string;
}): string {
  if (item.summary?.trim()) return truncatePreview(item.summary, 72);
  if (item.preview_text?.trim()) return truncatePreview(item.preview_text, 72);
  try {
    const d = new Date(item.created_at);
    const label = new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'short',
    }).format(d);
    return `שיחה מ-${label}`;
  } catch {
    return 'שיחה עם אלמוג';
  }
}
