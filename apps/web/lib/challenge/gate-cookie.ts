/**
 * perf: קאש קצר (פר-משתמש) לתוצאת "אין אתגר פעיל" במידלוור — חוסך שאילתת
 * challenge_enrollments בכל ניווט לרוב המשתמשים שאינם באתגר.
 *
 * אבטחה: ה-cookie חתום ב-HMAC-SHA256 (Web Crypto, תואם Edge), קשור ל-userId,
 * ועם תפוגה מוטמעת. cookie מזויף/של משתמש אחר/פג תוקף → מתעלמים ושולפים מה-DB.
 * בלי סוד מוגדר — הקאש כבוי לגמרי (התנהגות זהה לקודם).
 * רק התוצאה השלילית נשמרת; משתמש באתגר תמיד נבדק מול ה-DB.
 */
export const CHALLENGE_GATE_COOKIE = 'nw_cg';
export const CHALLENGE_GATE_TTL_MS = 3 * 60 * 1000;

function gateSecret(): string | null {
  const s =
    process.env.CHALLENGE_GATE_COOKIE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    '';
  return s.length >= 16 ? s : null;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`challenge-gate:v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ערך cookie חתום ל"אין אתגר" עבור userId; null אם אין סוד. */
export async function signNoChallengeGate(userId: string, nowMs = Date.now()): Promise<string | null> {
  const secret = gateSecret();
  if (!secret) return null;
  const exp = nowMs + CHALLENGE_GATE_TTL_MS;
  const payload = `${userId}.${exp}.none`;
  return `${exp}.${await hmac(secret, payload)}`;
}

/** true רק אם ה-cookie תקף, לא פג, וחתום עבור אותו userId. */
export async function isNoChallengeGateValid(
  value: string | undefined,
  userId: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const secret = gateSecret();
  if (!secret) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const expRaw = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= nowMs || exp > nowMs + CHALLENGE_GATE_TTL_MS + 5_000) return false;
  const expected = await hmac(secret, `${userId}.${expRaw}.none`);
  return timingSafeEqual(sig, expected);
}

/**
 * ביטול הקאש אחרי שינוי הרשמה לאתגר (route handler / server action של המשתמש).
 * מחוץ להקשר בקשה (cron) — no-op; שם ה-TTL הקצר (3 דק') מגביל את הסטייה.
 */
export async function clearChallengeGateCookie(): Promise<void> {
  try {
    const { cookies } = await import('next/headers');
    (await cookies()).delete(CHALLENGE_GATE_COOKIE);
  } catch {
    /* אין הקשר בקשה / קריאה בלבד — מתעלמים */
  }
}
