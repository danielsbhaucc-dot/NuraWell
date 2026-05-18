/**
 * שליחת מייל דרך Resend HTTP API (ללא חבילה נוספת).
 * דורש RESEND_API_KEY; כתובת שולח לפי sender או from מפורש.
 */

import { type EmailSenderKey, resolveEmailFrom } from './senders';

export type SendResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** שולח לפי מפתח (dolev, default…) — ראה lib/email/senders.ts */
  sender?: EmailSenderKey;
  /** דורס sender — מחרוזת From מלאה ל-Resend */
  from?: string;
};

export async function sendResendEmail(
  input: SendResendEmailInput
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = input.from?.trim() || resolveEmailFrom(input.sender ?? 'default');

  if (!apiKey) {
    return { ok: false, error: 'RESEND לא מוגדר (RESEND_API_KEY)' };
  }
  if (!from) {
    return { ok: false, error: 'חסרה כתובת שולח (sender / from)' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const data = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: data.message ?? `Resend ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת רשת';
    return { ok: false, error: msg };
  }
}
