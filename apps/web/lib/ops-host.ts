/**
 * נקרא גם מ־middleware וגם מ־API guards.
 * NEXT_PUBLIC_OPS_HOSTNAME — hostname בלבד, למשל ops.nurawell.ai
 */
export function opsCanonicalHostname(): string {
  return process.env.NEXT_PUBLIC_OPS_HOSTNAME?.trim().toLowerCase().replace(/^www\./, '') ?? '';
}

export function requestHostname(hostnameHeader: string | null): string {
  return hostnameHeader?.split(':')[0]?.toLowerCase() ?? '';
}

/** האם הבקשה מגיעה מכתובת Ops המוגדרת */
export function isOpsHostname(hostnameHeader: string | null): boolean {
  const canonical = opsCanonicalHostname();
  if (!canonical) return false;
  return requestHostname(hostnameHeader) === canonical;
}

/** תצוגת preview ב־Vercel (*.vercel.app) — רק אם OPS_ALLOW_VERCEL_PREVIEW=1 */
export function isOpsPreviewHostname(hostnameHeader: string | null): boolean {
  if (process.env.OPS_ALLOW_VERCEL_PREVIEW !== '1') return false;
  const h = requestHostname(hostnameHeader);
  return h.endsWith('.vercel.app');
}
