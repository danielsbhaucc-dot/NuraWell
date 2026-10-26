import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Break-glass password rotation. ops_break_glass_reset() sets ops_security_state.password_rotation_required;
 * until the founder sets a NEW password (proven with one of the fresh recovery codes), every Ops API call except
 * the ones needed to get there is refused, and the Ops layout shows only the rotation screen.
 */
export const ROTATE_PASSWORD_PATH = '/api/v1/ops/security/rotate-password';
/** Paths still reachable while rotation is pending: approving the new device and the rotation itself. */
const EXEMPT = [ROTATE_PASSWORD_PATH, '/api/v1/ops/device', '/api/v1/ops/stepup'];

export function rotationExempt(path: string): boolean {
  const p = path.replace(/\/+$/, '');
  return EXEMPT.some((e) => p === e || p.startsWith(`${e}/`));
}

/** Fails CLOSED: a DB error counts as "rotation required" (the rotation route itself stays reachable). */
export async function passwordRotationRequired(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('ops_security_state').select('password_rotation_required').eq('user_id', userId).maybeSingle();
  if (error) return true;
  return Boolean((data as { password_rotation_required?: boolean } | null)?.password_rotation_required);
}

export const MIN_PASSWORD_LENGTH = 12;

/** Server-side policy for the new password. Returns a Hebrew error or null. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `הסיסמה צריכה לכלול לפחות ${MIN_PASSWORD_LENGTH} תווים.`;
  if (pw.length > 128) return 'הסיסמה ארוכה מדי.';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'שלבו לפחות שלושה מהסוגים: אותיות קטנות, גדולות, ספרות וסימנים.';
  if (/^(.)\1+$/.test(pw)) return 'הסיסמה חלשה מדי.';
  return null;
}

export type RotateResult = { ok: true } | { ok: false; status: number; error: string };
type Deps = {
  setPassword: (userId: string, password: string) => Promise<{ error: string | null }>;
  audit: (event: string, detail: Record<string, unknown>) => Promise<void>;
  alert: (text: string) => Promise<void>;
  now?: () => number;
  maxFails?: number;
  lockMin?: number;
};

/**
 * Consume one recovery code (with the same DB lockout as the device flow), set the new password, clear the flag.
 * The code is burned before the password changes, so a replay can never rotate twice.
 */
export async function rotatePasswordWithCode(db: SupabaseClient, userId: string, code: string, password: string, d: Deps): Promise<RotateResult> {
  const now = d.now?.() ?? Date.now();
  const policy = passwordPolicyError(password);
  if (policy) return { ok: false, status: 400, error: policy };
  const { data: st } = await db.from('ops_security_state').select('recovery_failures, recovery_locked_until').eq('user_id', userId).maybeSingle();
  const s = st as { recovery_failures: number | null; recovery_locked_until: string | null } | null;
  if (s?.recovery_locked_until && Date.parse(s.recovery_locked_until) > now) return { ok: false, status: 429, error: 'נחסם זמנית אחרי ניסיונות כושלים. נסו שוב מאוחר יותר.' };
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { data: hit } = norm.length === 10 ? await db.rpc('ops_use_recovery_code', { p_user: userId, p_code: code }) : { data: false };
  if (hit !== true) {
    const fails = (s?.recovery_failures ?? 0) + 1;
    const lock = fails >= (d.maxFails ?? 5);
    await db.from('ops_security_state').update({
      recovery_failures: lock ? 0 : fails,
      recovery_locked_until: lock ? new Date(now + (d.lockMin ?? 30) * 60_000).toISOString() : null,
      updated_at: new Date(now).toISOString(),
    }).eq('user_id', userId);
    await d.audit(lock ? 'ops_rotation_code_locked' : 'ops_rotation_code_failed', { fails });
    return { ok: false, status: lock ? 429 : 400, error: lock ? 'נחסם ל-30 דקות אחרי 5 ניסיונות כושלים.' : 'קוד הגיבוי לא תקין.' };
  }
  const set = await d.setPassword(userId, password);
  if (set.error) {
    await d.audit('ops_rotation_password_failed', {});
    return { ok: false, status: 400, error: 'לא הצלחנו לשמור את הסיסמה. בחרו סיסמה אחרת (שונה מהקודמת) ונסו שוב עם קוד גיבוי נוסף.' };
  }
  await db.from('ops_security_state').update({ password_rotation_required: false, recovery_failures: 0, recovery_locked_until: null, updated_at: new Date(now).toISOString() }).eq('user_id', userId);
  await d.audit('ops_password_rotated_after_break_glass', {});
  await d.alert('🔐 הסיסמה של חשבון הניהול הוחלפה אחרי שבירת זכוכית (אומתה בקוד גיבוי). אם זה לא אתם, הריצו שוב את שבירת הזכוכית מיד.');
  return { ok: true };
}
