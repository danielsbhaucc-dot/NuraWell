import { Buffer } from 'node:buffer';

function decodeJwtPayload(part: string): { role?: string } {
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { role?: string };
  } catch {
    return {};
  }
}

/** בודק שהמחרוזת היא JWT של service_role (לא anon בטעות ב-Vercel). */
export function jwtRoleClaim(jwt: string): string | null {
  const t = jwt?.trim();
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  const payload = decodeJwtPayload(parts[1]);
  return typeof payload.role === 'string' ? payload.role : null;
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
