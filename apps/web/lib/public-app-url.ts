/**
 * כתובת האפליקציה הציבורית (דף הבית / לוגין).
 * סדר עדיפות: DB (site_settings) → NEXT_PUBLIC_APP_URL → ברירת מחדל Vercel.
 */
export const PUBLIC_APP_URL_DEFAULT = 'https://nurawell.vercel.app';

const PRODUCTION_AI_FALLBACK = 'https://nurawell.ai';

export function normalizeToOrigin(raw: string): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const withProtocol = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** מ־NEXT_PUBLIC_APP_URL בלבד (ללא DB). */
export function publicAppOriginFromEnv(): string | null {
  return normalizeToOrigin(process.env.NEXT_PUBLIC_APP_URL ?? '');
}

/**
 * לשימוש כשאין גישה ל־DB (בנייה, מודולים סינכרוניים).
 * env → ברירת מחדל Vercel; בפיתוח localhost מ־env.example.
 */
export function publicAppOriginSync(): string {
  return publicAppOriginFromEnv() ?? PUBLIC_APP_URL_DEFAULT;
}

/** בסיס ל־Referer ודומה בלי לשבור ספקים שמצפים ל־nurawell.ai בפרודקשן ישן */
export function publicAppUrlForAiReferer(): string {
  return publicAppOriginFromEnv() ?? (process.env.NODE_ENV === 'production' ? PRODUCTION_AI_FALLBACK : PUBLIC_APP_URL_DEFAULT);
}

export function publicAppBaseNoSlashSync(): string {
  return publicAppOriginSync().replace(/\/$/, '');
}

/** fetch ל־PostgREST — תואם Edge middleware */
export async function fetchPublicAppOriginFromSupabase(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${url}/rest/v1/site_settings?id=eq.1&select=public_app_url`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const first = rows[0] as { public_app_url?: unknown };
    return typeof first.public_app_url === 'string' ? normalizeToOrigin(first.public_app_url) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** ל־middleware Ops: DB → env → ברירת מחדל (לא origin של הבקשה). */
export async function resolvePublicAppOriginForOpsRedirect(): Promise<string> {
  const fromDb = await fetchPublicAppOriginFromSupabase();
  if (fromDb) return fromDb;
  return publicAppOriginFromEnv() ?? PUBLIC_APP_URL_DEFAULT;
}

export async function resolvePublicAppOriginFromSupabaseClient(supabase: unknown): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('site_settings')
    .select('public_app_url')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data || typeof (data as { public_app_url?: unknown }).public_app_url !== 'string') {
    return publicAppOriginFromEnv() ?? PUBLIC_APP_URL_DEFAULT;
  }
  return normalizeToOrigin((data as { public_app_url: string }).public_app_url) ?? (publicAppOriginFromEnv() ?? PUBLIC_APP_URL_DEFAULT);
}

export async function publicAppBaseNoSlashFromServer(supabase: unknown): Promise<string> {
  const origin = await resolvePublicAppOriginFromSupabaseClient(supabase);
  return origin.replace(/\/$/, '');
}
