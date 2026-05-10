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

/** האם פרמטר redirect מ־/login מצביע על דומיין Ops (מותר לגשר סשן). */
export function isOpsLoginRedirectUrl(redirectParam: string): boolean {
  let u: URL;
  try {
    u = new URL(redirectParam);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const canon = opsCanonicalHostname();
  if (canon && host === canon) return true;
  const opsUrl = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (opsUrl) {
    try {
      const withP = opsUrl.startsWith('http') ? opsUrl : `https://${opsUrl}`;
      const oh = new URL(withP).hostname.replace(/^www\./, '').toLowerCase();
      if (host === oh) return true;
    } catch {
      /* */
    }
  }
  if (process.env.OPS_ALLOW_VERCEL_PREVIEW === '1' && host.endsWith('.vercel.app')) {
    return true;
  }
  return false;
}

/**
 * נתיבי URL כפי שהדפדפן רואה בדומיין Ops (לפני rewrite פנימי).
 * רק אלה מותרים; כל השאר → הפניה לעמוד הבית של הפאנל (`/`).
 */
export function isOpsPanelBrowserPath(pathname: string): boolean {
  const p = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (p === '/' || p === '') return true;
  if (p === '/auth/ops-ingest') return true;
  const prefixes = ['/journey', '/almog', '/steps', '/site-settings', '/system-rag-ingest', '/ops'];
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
