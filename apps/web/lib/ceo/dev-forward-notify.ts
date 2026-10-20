import type { SupabaseClient } from '@supabase/supabase-js';
import { allowedChatIds } from './channel';
import { isMorningBatchTime, notifyDoneForwards } from './dev-forward';
import { digestRecipients, readGideonSettings } from './settings';
import { createTelegramChannel, resolveBotToken } from './telegram';

/** Cron hook (hourly): Ori's finished items → one morning update ~07:30 IL, through the gated send (Shabbat/quiet). */
export async function notifyDevForwardsDone(db: SupabaseClient, now = new Date()): Promise<number> {
  if (!isMorningBatchTime(now)) return 0;
  if (!(await resolveBotToken())) return 0;
  const chats = digestRecipients(await readGideonSettings(db), allowedChatIds());
  if (!chats.length) return 0;
  const ch = createTelegramChannel();
  return notifyDoneForwards(db, async (text) => {
    for (const c of chats) await ch.send(c, text, undefined, { kind: 'report', topic: 'dev_forward' }); // gated (Shabbat / quiet hours)
  });
}
