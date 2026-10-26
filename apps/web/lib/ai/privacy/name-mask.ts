/** First-name masking shared by notification QC and Almog reply QC (no model/vendor deps). */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskName(text: string, firstName?: string | null): string {
  const n = firstName?.trim();
  if (!n || n.length < 2) return text;
  return text.replace(new RegExp(escapeRe(n), 'gu'), '[NAME]');
}

export function unmaskName(text: string, firstName?: string | null): string {
  const n = firstName?.trim();
  return n ? text.replace(/\[NAME\]/g, n) : text;
}
