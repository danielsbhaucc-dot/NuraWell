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
    fallback: 'Dolev NuraWell.ai <dolev@nurawell.ai>',
  },
  almog: {
    envVar: 'RESEND_FROM_ALMOG',
    fallback: 'Almog · NuraWell <onboarding@nurawell.ai>',
  },
};

/** מחזיר מחרוזת From ל-Resend, למשל `Dolev <dolev@nurawell.ai>` */
export function resolveEmailFrom(key: EmailSenderKey = 'default'): string {
  const def = EMAIL_SENDERS[key];
  const fromEnv = process.env[def.envVar]?.trim();
  if (fromEnv) return fromEnv;
  if (key === 'default') {
    return def.fallback;
  }
  return def.fallback;
}
