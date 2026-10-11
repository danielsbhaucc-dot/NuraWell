import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { filterNotifyEligibleUserIds } from '@/lib/notifications/notify-recipients';
import { insertNotification } from '@/lib/notifications/deliver';
import { afterAlmogInAppNotification } from '@/lib/notifications/after-almog-insert';
import { evaluateNotifyGate } from '@/lib/notifications/notify-recipients';
import { getPlan, runLadderMonitor } from './index';

/**
 * Almog's autonomous daily ladder monitor (unified scheduler → master job): steps users back up
 * after sustained success, or one step easier after repeated misses, and tells them. No admin involvement.
 */
export async function runTaskLadderMonitorBatch(admin: SupabaseClient) {
  const { data } = await admin
    .from('user_task_assignments')
    .select('user_id')
    .eq('status', 'accepted')
        .limit(5000);
  const users = await filterNotifyEligibleUserIds(admin, [...new Set((data ?? []).map((r) => r.user_id as string))]);
  let changedCount = 0;
  for (const userId of users) {
    const changes = await runLadderMonitor(admin, userId);
    if (!changes.length) continue;
    changedCount += changes.length;
    const gate = await evaluateNotifyGate(admin, userId);
    if (!gate.ok) continue;
    const plan = await getPlan(admin, userId);
    const t = plan.find((p) => p.id === changes[0].assignmentId);
    if (!t) continue;
    const up = changes[0].direction === 'harder';
    const title = up ? 'עולים שלב 🌱' : 'מקלים צעד 🤝';
    const body = up
      ? `הצלחת בעקביות — אז אני מעלה צעד אחד: ${t.level.title}. אם זה כבד מדי, אפשר ללחוץ "קשה לי" בתוכנית ונחזור צעד אחורה.`
      : `ראיתי שהימים האחרונים היו קשים, אז הקלתי: ${t.level.title}. ככה בונים הצלחה — וכשזה יתייצב, נעלה שוב בהדרגה.`;
    const { error } = await insertNotification(admin, {
      user_id: userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌱',
      action_url: '/plans',
      is_read: false,
      is_sent: true,
      send_at: new Date().toISOString(),
      metadata: { mentor: 'almog', source: up ? 'task_ladder_step_up' : 'task_ladder_step_down', assignment_id: t.id, to_level: t.current_level },
    });
    if (!error) afterAlmogInAppNotification(userId, title, body);
  }
  return { users: users.length, level_changes: changedCount };
}
