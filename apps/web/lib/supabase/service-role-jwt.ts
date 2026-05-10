import { Buffer } from 'node:buffer';

type JwtPayload = { role?: string; ref?: string };

function decodeJwtPayload(part: string): JwtPayload {
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JwtPayload;
  } catch {
    return {};
  }
}

/** ref ב-JWT Supabase — חייב להתאים ל-host של הפרויקט */
export function jwtRefClaim(jwt: string): string | null {
  const t = jwt?.trim();
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  const ref = decodeJwtPayload(parts[1]).ref;
  return typeof ref === 'string' ? ref : null;
}

/** בודק שהמחרוזת היא JWT של service_role (לא anon בטעות ב-Vercel). */
export function jwtRoleClaim(jwt: string): string | null {
  const t = jwt?.trim();
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  const role = decodeJwtPayload(parts[1]).role;
  return typeof role === 'string' ? role : null;
}

function isSupabaseSecretApiKey(key: string): boolean {
  return key.startsWith('sb_secret_');
}

/** מנקה BOM, מרכאות, ורווחים/שורות שבורים בהדבקה ל-Vercel */
export function normalizeServiceRoleKeyEnv(raw: string | undefined): string {
  if (!raw) return '';
  let k = raw.replace(/^\uFEFF/, '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  k = k.split(/\s+/).join('').trim();
  return k;
}

/** מחלץ את מזהה הפרויקט מ-https://xxxx.supabase.co */
export function supabaseProjectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const u = new URL(supabaseUrl.trim());
    const m = u.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function assertServiceRoleKey(key: string): { ok: true } | { ok: false; message: string } {
  const role = jwtRoleClaim(key);
  if (!role) {
    return { ok: false, message: 'SUPABASE_SERVICE_ROLE_KEY לא נראה כמו JWT תקין' };
  }
  if (role !== 'service_role') {
    return {
      ok: false,
      message: `ב-Vercel הוגדר מפתח עם role=${role} במקום service_role. הדבק את ה-Service role מ־Supabase → Settings → API (לא את ה-anon).`,
    };
  }
  return { ok: true };
}

/**
 * Legacy JWT service_role או מפתח sb_secret חדש (לא JWT — בלי בדיקת ref).
 * אם הודבק sb_publishable / anon בטעות — עוצרים מוקדם.
 */
export function assertSupabaseBackendSecretKey(
  key: string,
  supabaseUrl: string
): { ok: true } | { ok: false; message: string } {
  if (!key) {
    return {
      ok: false,
      message: 'חסר מפתח שרת: הגדר ב-Vercel את SUPABASE_SERVICE_ROLE_KEY (מומלץ: Legacy service_role JWT) או SUPABASE_SECRET_KEY (sb_secret_).',
    };
  }
  if (key.startsWith('sb_publishable_')) {
    return {
      ok: false,
      message: 'הוגדר מפתח sb_publishable (ציבורי). לשרת צריך sb_secret או Legacy service_role מ־Settings → API Keys.',
    };
  }
  if (isSupabaseSecretApiKey(key)) {
    return { ok: true };
  }
  const roleCheck = assertServiceRoleKey(key);
  if (!roleCheck.ok) {
    return {
      ok: false,
      message: `${roleCheck.message} אם ב-Dashboard מופיע רק מפתח sb_secret_, העתק אותו ל-SUPABASE_SECRET_KEY (או החלף את משתנה ה-service role).`,
    };
  }
  return assertServiceRoleMatchesProjectUrl(key, supabaseUrl);
}

export function assertServiceRoleMatchesProjectUrl(
  key: string,
  supabaseUrl: string
): { ok: true } | { ok: false; message: string } {
  const keyRef = jwtRefClaim(key);
  const urlRef = supabaseProjectRefFromUrl(supabaseUrl);
  if (!urlRef) {
    return {
      ok: false,
      message:
        'NEXT_PUBLIC_SUPABASE_URL חייב להיות בפורמט https://<ref>.supabase.co — אם השתמשת ב-URL אחר, ייתכן אי-התאמה למפתח.',
    };
  }
  if (!keyRef || keyRef.toLowerCase() !== urlRef) {
    return {
      ok: false,
      message: `ה-Service role לא שייך לאותו פרויקט Supabase: ב-JWT מופיע ref="${keyRef ?? 'חסר'}" אבל בכתובת הפרויקט ref="${urlRef}". פתח את אותו פרויקט ב-Dashboard והדבק מחדש את שני הערכים מ־Settings → API.`,
    };
  }
  return { ok: true };
}
