/**
 * נקרא גם מ־middleware וגם מ־API guards.
 * NEXT_PUBLIC_OPS_HOSTNAME — hostname בלבד, למשל ops.nurawell.ai
 */
export function opsCanonicalHostname(): string {
  return process.env.NEXT_PUBLIC_OPS_HOSTNAME?.trim().toLowerCase().replace(/^www\./, '') ?? '';
}

/**
 * Prefix של פרויקט-Vercel שמותר ב-preview. למשל "nurawell-" יתאים לכל ה-deployments
 * של פרויקט nurawell (`nurawell-abcd1234.vercel.app`). ברירת מחדל "nurawell-" כדי שלא
 * נקבל כל *.vercel.app אקראי מהאינטרנט (גם אם יש לו admin session — שזה דליפת cookie
 * אחרת — לפחות לא נגדיר את ה-host כ-ops).
 */
function vercelPreviewProjectPrefix(): string {
  const raw = process.env.OPS_VERCEL_PREVIEW_PROJECT_PREFIX?.trim();
  if (raw) return raw.toLowerCase();
  return 'nurawell-';
}

export function requestHostname(hostnameHeader: string | null): string {
  return hostnameHeader?.split(':')[0]?.toLowerCase() ?? '';
}

function opsUrlHostname(): string {
  const opsUrl = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!opsUrl) return '';
  try {
    const withP = opsUrl.startsWith('http') ? opsUrl : `https://${opsUrl}`;
    return new URL(withP).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Host מורשה ל-OPS API (דומיין Ops, preview, localhost, או NEXT_PUBLIC_OPS_URL). */
export function isTrustedOpsRequestHost(hostname: string | null | undefined): boolean {
  const h = requestHostname(hostname ?? null);
  if (!h) return false;
  if (isOpsHostname(h) || isOpsPreviewHostname(h)) return true;
  if (
    process.env.NODE_ENV === 'development' &&
    (h === 'localhost' || h === '127.0.0.1')
  ) {
    return true;
  }
  const fromOpsUrl = opsUrlHostname();
  return Boolean(fromOpsUrl && h === fromOpsUrl);
}

/**
 * דריוואט בטוח של ה-host מאוביקט Request — Next.js בונה את `request.url` מ-host
 * שעבר ולידציה פנימית. כש-x-forwarded-host הוא דומיין Ops מוכר (Vercel) — סומכים עליו
 * גם אם request.url שונה (edge/internal).
 */
export function requestHostnameFromRequest(request: Request): string {
  try {
    const fromUrl = new URL(request.url).hostname.toLowerCase();
    const headerHost = requestHostname(
      request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    );
    if (headerHost && isTrustedOpsRequestHost(headerHost)) {
      return headerHost;
    }
    if (headerHost && headerHost !== fromUrl) {
      return fromUrl;
    }
    return fromUrl || headerHost;
  } catch {
    return requestHostname(
      request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    );
  }
}

/** האם הבקשה מגיעה מכתובת Ops המוגדרת */
export function isOpsHostname(hostnameHeader: string | null): boolean {
  const h = requestHostname(hostnameHeader);
  const canonical = opsCanonicalHostname();
  if (canonical && h === canonical) return true;
  const fromOpsUrl = opsUrlHostname();
  return Boolean(fromOpsUrl && h === fromOpsUrl);
}

/**
 * תצוגת preview ב־Vercel — רק אם OPS_ALLOW_VERCEL_PREVIEW=1 *וגם* ה-hostname
 * מתחיל ב-prefix של הפרויקט (ברירת מחדל "nurawell-"). זה חוסם תרחיש בו תוקף
 * הולך לכל *.vercel.app וטוען credentials של admin כדי להגיע לפאנל.
 */
export function isOpsPreviewHostname(hostnameHeader: string | null): boolean {
  if (process.env.OPS_ALLOW_VERCEL_PREVIEW !== '1') return false;
  const h = requestHostname(hostnameHeader);
  if (!h.endsWith('.vercel.app')) return false;
  const prefix = vercelPreviewProjectPrefix();
  if (!prefix) return false;
  return h.startsWith(prefix);
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
    const prefix = vercelPreviewProjectPrefix();
    if (prefix && host.startsWith(prefix)) return true;
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
  const prefixes = [
    '/guides',
    '/journey',
    '/journey-hub',
    '/almog',
    '/mentors',
    '/costs',
    '/steps',
    '/site-settings',
    '/system-rag-ingest',
    '/users',
    '/audio',
    '/accessibility',
    '/challenge',
    '/ops',
  ];
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
