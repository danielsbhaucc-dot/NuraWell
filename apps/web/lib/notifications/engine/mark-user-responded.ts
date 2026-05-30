/**
 * `markUserResponded` — fire-and-forget helper שמעדכן את
 * `profiles.last_responded_at = NOW()`.
 *
 * נקרא ע"י נתיב הצ'אט (`/api/v1/ai/chat`) אחרי שמשתמש שולח הודעה,
 * וע"י flows אחרים שבהם המשתמש "מסמן נוכחות" (סימון משימה ידני
 * דרך פעולת push, וכו'). מטרת הסימון: לאפשר ל-notification engine
 * לדלג על slot ההתראה הקרוב אם המשתמש פעיל ב-6 השעות האחרונות.
 *
 * 🛡️ העיקרון: כשלון כאן *לא* יקרוס את הקריאה הצרכנית. ה-engine פשוט
 * יראה ערך ישן יותר בקרון הבא — אובדן UX זניח לעומת השלת הצ'אט.
 *
 * 🔌 שימוש (next.js after()):
 *   import { after } from 'next/server';
 *   after(() => markUserResponded(createAdminClient(), user.id));
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarkUserRespondedOptions {
  /** רישום debug אופציונלי לקונסול עם תיוג. */
  debugTag?: string;
}

export async function markUserResponded(
  admin: SupabaseClient,
  userId: string,
  options: MarkUserRespondedOptions = {}
): Promise<void> {
  if (!userId) return;
  const tag = options.debugTag ?? 'notification-engine';

  try {
    // עדיפות 1: RPC אטומי (מוגדר ב-migration 000029).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (admin as any).rpc(
      'touch_last_responded_at',
      { p_user_id: userId }
    );
    if (rpcError) {
      // אם ה-RPC לא קיים (deploy מאחור), fallback ל-UPDATE רגיל.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (admin as any)
        .from('profiles')
        .update({ last_responded_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateError) {
        // eslint-disable-next-line no-console
        console.warn(`[${tag}] markUserResponded: rpc+update both failed`, {
          rpc: rpcError.message ?? rpcError,
          update: updateError.message ?? updateError,
        });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[${tag}] markUserResponded threw:`,
      err instanceof Error ? err.message : err
    );
  }
}
