/**
 * תזמון *מדויק* לתזכורות קרובות דרך QStash delayed message.
 *
 * הבעיה: ה-cron של ריקון התזכורות (`drainAlmogReminders`) רץ כל ~30 דקות, ולכן
 * תזכורת ל"בעוד 5 דקות" הייתה מגיעה רק בריצת ה-cron הבאה (עד חצי שעה איחור).
 *
 * הפתרון: כשתזכורת נקבעת לטווח הקרוב (≤ {@link PRECISE_REMINDER_WINDOW_MIN}
 * דקות), בנוסף לשמירה ב-DB אנחנו מפרסמים הודעת QStash מושהית (`Upstash-Not-Before`)
 * ל-`fire_at` המדויק. QStash מפעיל את endpoint המסירה בדיוק בזמן, והוא מריץ
 * `drainAlmogReminders` *לאותו משתמש* — כך ההתראה יוצאת בזמן שביקש.
 *
 * תזכורות רחוקות יותר ממשיכות להישלח דרך ה-cron הרגיל (אין צורך בתזמון מדויק).
 * הפונקציה לעולם לא זורקת — אם QStash לא מוגדר, נופלים בשקט חזרה ל-cron.
 */

import { workflowPublicBaseUrl } from '../../workflows/resolve-workflow-public-url';

/** חלון "קרוב" — מתחת לתדירות ה-cron (30 דק'); מעבר לזה ה-cron הרגיל מספיק. */
export const PRECISE_REMINDER_WINDOW_MIN = 25;

export type PreciseReminderResult =
  | { ok: true; messageId: string | null; fireAtIso: string }
  | { ok: false; reason: string };

function qstashApiBaseUrl(): string {
  const raw = process.env.QSTASH_URL?.trim();
  if (!raw) return 'https://qstash.upstash.io';
  return raw.replace(/\/$/, '');
}

export async function schedulePreciseReminderDelivery(params: {
  userId: string;
  fireAtIso: string;
  now?: Date;
}): Promise<PreciseReminderResult> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return { ok: false, reason: 'qstash_token_missing' };

  const now = params.now ?? new Date();
  const fireMs = new Date(params.fireAtIso).getTime();
  if (!Number.isFinite(fireMs)) return { ok: false, reason: 'invalid_fire_at' };
  if (fireMs <= now.getTime()) return { ok: false, reason: 'fire_at_not_future' };
  // רחוק מהחלון הקרוב — ה-cron הרגיל יתפוס, אין צורך לתזמן מדויק.
  if (fireMs > now.getTime() + PRECISE_REMINDER_WINDOW_MIN * 60_000) {
    return { ok: false, reason: 'beyond_precise_window' };
  }

  const base = workflowPublicBaseUrl();
  if (!base) return { ok: false, reason: 'public_base_url_missing' };

  const notBeforeSeconds = Math.floor(fireMs / 1000);
  const destination = `${base.replace(/\/$/, '')}/api/v1/ai/cron/almog-reminders/deliver`;
  // dedupe לפי משתמש+דקת-יעד: לא נתזמן פעמיים את אותו רגע מסירה.
  const dedupeId = `almog-reminder:${params.userId}:${notBeforeSeconds}`;

  try {
    const res = await fetch(`${qstashApiBaseUrl()}/v2/publish/${encodeURIComponent(destination)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Method': 'POST',
        'Upstash-Not-Before': String(notBeforeSeconds),
        'Upstash-Retries': '2',
        'Upstash-Deduplication-Id': dedupeId,
      },
      body: JSON.stringify({ userId: params.userId, fireAtIso: params.fireAtIso }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, reason: `qstash_publish_failed:${res.status}:${text.slice(0, 120)}` };
    }

    const json = (await res.json().catch(() => null)) as { messageId?: string } | null;
    console.info('[almog-commitments] precise reminder scheduled', {
      messageId: json?.messageId ?? null,
      fire_at: params.fireAtIso,
      destination,
    });
    return { ok: true, messageId: json?.messageId ?? null, fireAtIso: params.fireAtIso };
  } catch (e) {
    return { ok: false, reason: `qstash_publish_error:${e instanceof Error ? e.message : String(e)}` };
  }
}
