import type { SupabaseClient } from '@supabase/supabase-js';
import { alertOwnerSecurity } from './device-notify';
import { logDetail } from '@/lib/logs/facts';

/** Break-glass and similar: Telegram + email to the owner, bypassing quiet hours. Idempotent. */
export async function dispatchSecurityEvents(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('ops_security_events').select('id, kind, facts, detail, created_at').is('alerted_at', null).order('created_at').limit(20);
  let n = 0;
  for (const e0 of (data ?? []) as { id: string; kind: string; facts?: unknown; detail: Record<string, unknown> | null }[]) {
    const e = { ...e0, detail: logDetail(e0) ?? {} };
    const { data: claimed } = await db.from('ops_security_events').update({ alerted_at: new Date().toISOString() }).eq('id', e.id).is('alerted_at', null).select('id');
    if (!claimed?.length) continue;
    const user = typeof e.detail.user === 'string' ? e.detail.user : null;
    if (e.kind === 'break_glass') {
      await alertOwnerSecurity(db, user, `🚨 איפוס חירום של אבטחת Ops בוצע.\nכל המכשירים המאושרים (${Number(e.detail.devices ?? 0)}) וקודי השחזור בוטלו.\nסיבה: ${String(e.detail.reason ?? '')}\nבכניסה הבאה תתבקש לאשר את המכשיר מחדש. אם לא ביקשת את זה, החלף סיסמה מיד.`, 'איפוס חירום של אבטחת Ops');
    } else {
      await alertOwnerSecurity(db, user, `🔐 אירוע אבטחה: ${e.kind}`, 'אירוע אבטחה ב-Ops');
    }
    n += 1;
  }
  return n;
}
