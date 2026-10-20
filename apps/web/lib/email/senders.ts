/**
 * כתובות שולח ל-Resend — כל מנטור/שימוש עם מפתח משלו.
 * אפשר לדרוס ב-Vercel: RESEND_FROM_DOLEV, RESEND_FROM_DEFAULT וכו׳
 * RESEND_FROM הישן נשאר = שולח ברירת מחדל (default) לתאימות לאחור.
 */

export const EMAIL_SENDER_KEYS = ['default', 'dolev', 'almog'] as const;
export type EmailSenderKey = (typeof EMAIL_SENDER_KEYS)[number];

type SenderDef = {
  /** משתנה סביבה אופציונלי, למשל RESEND_FROM_DOLEV */
  envVar: string;
  /** ברירת מחדל כשאין env — חייב דומיין מאומת ב-Resend */
  fallback: string;
};

export const EMAIL_SENDERS: Record<EmailSenderKey, SenderDef> = {
  default: {
    envVar: 'RESEND_FROM',
    fallback: 'NuraWell <onboarding@nurawell.ai>',
  },
  dolev: {
    envVar: 'RESEND_FROM_DOLEV',
    fallback: 'דולב מ-NuraWell <dolev@nurawell.ai>',
  },
  almog: {
    envVar: 'RESEND_FROM_ALMOG',
    fallback: 'אלמוג מ-NuraWell <onboarding@nurawell.ai>',
  },
};

const FROM_RE = /^(?:[^<>@]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

/** Cleans an env-provided From (stray quotes/whitespace); returns null when it is not a valid Resend From. */
export function normalizeFrom(v: string | undefined | null): string | null {
  const t = String(v ?? '').trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();
  return t && FROM_RE.test(t) ? t : null;
}

/** מחזיר מחרוזת From ל-Resend, למשל `Dolev <dolev@nurawell.ai>`. env לא תקין → ברירת המחדל (במקום כשל שליחה). */
export function resolveEmailFrom(key: EmailSenderKey = 'default'): string {
  const def = EMAIL_SENDERS[key];
  const raw = process.env[def.envVar];
  const fromEnv = normalizeFrom(raw);
  if (fromEnv) return fromEnv;
  if (raw?.trim()) console.warn(`[email] ${def.envVar} is not a valid From address; using built-in default`);
  return def.fallback;
}
