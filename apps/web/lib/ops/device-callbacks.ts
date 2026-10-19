import type { SupabaseClient } from '@supabase/supabase-js';
import { killSwitch } from '@/lib/ceo/security';
import { audit, decideRequest, loadRequest } from './device-trust';
import { oneTapAllowed } from './device-notify';

/** Telegram buttons on the login card. Chat is already verified as the owner's allowlisted chat. */
export async function handleLoginCallback(db: SupabaseClient, kind: 'la' | 'ld', id: string, chatId: string): Promise<string> {
  if (kind === 'la') {
    if (!(await oneTapAllowed(db))) return 'אישור בלחיצה אחת כבר לא זמין. אשר עם Face ID, קוד מהמייל או קוד שחזור.';
    const d = await decideRequest(db, id, true, `telegram_onetap:${chatId}`);
    if (d) await audit(db, d.user_id, 'ops_login_onetap_bootstrap', { id, chat: chatId.slice(-4) });
    return d ? '✅ הכניסה אושרה (אישור חד-פעמי בתקופת ההפעלה). מומלץ לרשום Face ID.' : 'הבקשה פגה או כבר טופלה.';
  }
  const r = await loadRequest(db, id);
  const d = await decideRequest(db, id, false, `telegram_deny:${chatId}`);
  if (!d && !r) return 'הבקשה לא נמצאה.';
  if (!d && r) await db.rpc('ops_revoke_user_sessions', { p_user: r.user_id });
  await killSwitch(db, `admin:${chatId}`, 'ops login denied: זה לא אני').catch(() => undefined);
  return '🚫 הכניסה נחסמה, כל החיבורים ל-Ops נותקו וגדעון כובה. מומלץ להחליף סיסמה עכשיו. הפעלה מחדש של גדעון: Ops ← גדעון ← אבטחה.';
}
