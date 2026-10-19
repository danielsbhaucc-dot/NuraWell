import type { SupabaseClient } from '@supabase/supabase-js';
import { allowedChatIds } from './channel';
import { notifyDoneForwards } from './dev-forward';
import { digestRecipients, readGideonSettings } from './settings';
import { createTelegramChannel, resolveBotToken } from './telegram';

/** Cron hook: Or marked items done → Daniel hears it from Gideon (through the regular channel.send). */
export async function notifyDevForwardsDone(db: SupabaseClient): Promise<number> {
  if (!(await resolveBotToken())) return 0;
  const chats = digestRecipients(await readGideonSettings(db), allowedChatIds());
  if (!chats.length) return 0;
  const ch = createTelegramChannel();
  return notifyDoneForwards(db, async (text) => {
    for (const c of chats) await ch.send(c, text, undefined, { kind: 'notice', topic: 'dev_forward' }); // gated (Shabbat / quiet hours)
  });
}
