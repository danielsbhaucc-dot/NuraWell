/** טקסט alt סטנדרטי לדמויות ונכסים חוזרים */
export const ALMOG_AVATAR_ALT = 'אלמוג, המנטור האישי';
export const DOLEV_AVATAR_ALT = 'דולב, המנטור';
export const NURAWELL_LOGO_ALT = 'NuraWell';

export function decorativeBackgroundAlt(): '' {
  return '';
}

export function mediaAltText(input: {
  title?: string | null;
  name?: string | null;
  fallback?: string;
}): string {
  const title = input.title?.trim() || input.name?.trim();
  if (title) return title;
  return input.fallback ?? 'תמונה';
}

export function stationCoverAlt(title: string, index?: number): string {
  const prefix = typeof index === 'number' ? `תמונת תחנה ${index + 1}: ` : 'תמונת תחנה: ';
  return `${prefix}${title}`;
}

export function stockPreviewAlt(description?: string | null, photographer?: string | null): string {
  const base = description?.trim() || 'תמונת stock';
  if (photographer?.trim()) return `${base} — ${photographer.trim()}`;
  return base;
}
