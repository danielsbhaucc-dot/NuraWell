import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotification } from '@/lib/notifications/deliver';
import { isUserNotifyEligible } from '@/lib/notifications/notify-recipients';

const DAY = 86_400_000;

/**
 * Daily (master cron): expire lapsed trials/canceled subs, and one gentle notice each for
 * "trial ends in ≤2 days" and "canceled subscription ends in ≤3 days". Notices are once per
 * subscription (unique index on billing_events). Admin/test accounts are skipped. Cheap when empty.
 */
export async function runBillingRetention(admin: SupabaseClient, now = new Date()) {
  const nowIso = now.toISOString();
  const out = { expired: 0, trial_notices: 0, expiring_notices: 0 };

  const { data: lapsedTrials } = await admin.from('subscriptions').update({ status: 'expired', updated_at: nowIso, ended_at: nowIso }).eq('status', 'trialing').lt('trial_ends_at', nowIso).select('id');
  const { data: lapsedCanceled } = await admin.from('subscriptions').update({ status: 'expired', updated_at: nowIso, ended_at: nowIso }).eq('status', 'canceled').lt('current_period_end', nowIso).select('id');
  out.expired = (lapsedTrials?.length ?? 0) + (lapsedCanceled?.length ?? 0);

  const notices: { kind: 'trial_ending_notice' | 'expiring_notice'; rows: { id: string; user_id: string }[]; title: string; body: string }[] = [];
  const { data: endingTrials } = await admin.from('subscriptions').select('id, user_id').eq('status', 'trialing').gte('trial_ends_at', nowIso).lt('trial_ends_at', new Date(now.getTime() + 2 * DAY).toISOString()).limit(500);
  notices.push({ kind: 'trial_ending_notice', rows: endingTrials ?? [], title: 'תקופת הניסיון מסתיימת בקרוב', body: 'עוד יומיים מסתיימת תקופת הניסיון. כדי להמשיך את המסע המלא איתי, אפשר לבחור מסלול בעמוד השדרוג.' });
  const { data: expiring } = await admin.from('subscriptions').select('id, user_id').eq('status', 'canceled').gte('current_period_end', nowIso).lt('current_period_end', new Date(now.getTime() + 3 * DAY).toISOString()).limit(500);
  notices.push({ kind: 'expiring_notice', rows: expiring ?? [], title: 'המנוי מסתיים בעוד כמה ימים', body: 'רציתי להזכיר שהמנוי מסתיים בקרוב. אם בא לך להמשיך יחד, אפשר לחדש בכל רגע. ההתקדמות שלך נשמרת.' });

  for (const n of notices) {
    for (const r of n.rows) {
      if (!(await isUserNotifyEligible(admin, r.user_id))) continue;
      const { error } = await admin.from('billing_events').insert({ user_id: r.user_id, subscription_id: r.id, kind: n.kind });
      if (error) continue; // already noticed (unique) or failed
      await insertNotification(admin, { user_id: r.user_id, type: 'system', title: n.title, body: n.body, metadata: { source: 'billing_retention', kind: n.kind, url: '/upgrade' } });
      if (n.kind === 'trial_ending_notice') out.trial_notices++;
      else out.expiring_notices++;
    }
  }
  return out;
}
