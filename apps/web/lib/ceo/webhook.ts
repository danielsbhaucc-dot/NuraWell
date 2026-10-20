import { withAiUsage } from '@/lib/ai/usage-meter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { approvalCard, decideAction, setActionTarget } from './actions';
import { runCeoTurn } from './agent';
import type { CeoChannel } from './channel';
import { allowedChatIds } from './channel';
import { setOwnerTask } from './owner-tasks';
import { invalidateTrust, killSwitch, requestDevice, securityState } from './security';
import { detectDeviceChange } from './intents';
import { suggestCommand } from './commands';
import { endSim, getSim, isSimExit, isSimStart, recordSimAttempt, SIM_MINUTES, SIM_REASON, simExpired, simKind, simSummary, startSim, type Sim } from './stranger-sim';

type TgChat = { id: number; type?: string };
type TgUser = { id: number; is_bot?: boolean };
type Update = {
  message?: { chat: TgChat; from?: TgUser; text?: string; message_id?: number };
  callback_query?: { id: string; from?: TgUser; data?: string; message?: { chat: TgChat; message_id: number } };
};

/**
 * Hard identity gate (code, never the model): the sender is Daniel only when BOTH the numeric
 * Telegram user id (from.id) and the private chat id are on the env allowlist, the chat is a
 * private 1:1 chat (from.id === chat.id) and the sender is not a bot. Names/usernames are never used.
 * Anything else → null (fail closed, also when the allowlist env is empty).
 */
export function authorizedSender(u: Update, allowed = allowedChatIds()): string | null {
  const chat = u.message?.chat ?? u.callback_query?.message?.chat;
  const from = u.message?.from ?? u.callback_query?.from;
  if (!chat || !from || from.is_bot) return null;
  if (chat.type !== 'private') return null;
  const chatId = String(chat.id);
  const fromId = String(from.id);
  if (!/^\d{1,20}$/.test(chatId) || fromId !== chatId) return null;
  return allowed.has(chatId) && allowed.has(fromId) ? chatId : null;
}

/** Secret-token header check (set via setWebhook secret_token). Fails closed when env is missing. */
export function verifyTelegramSecret(header: string | null, secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()): boolean {
  return Boolean(secret && header && timingSafeEqualStr(header, secret));
}

export async function handleTelegramUpdate(...a: Parameters<typeof handleTelegramUpdateInner>) {
  return withAiUsage({ feature: 'gideon_chat' }, () => handleTelegramUpdateInner(...a));
}

async function handleTelegramUpdateInner(db: SupabaseClient, channel: CeoChannel, u: Update, deps: { runTurn?: typeof runCeoTurn } = {}) {
  const chatId = String(u.message?.chat.id ?? u.callback_query?.message?.chat.id ?? '');
  if (!chatId) return { ignored: true };
  const authed = authorizedSender(u);
  let sim: Sim | null = null;
  if (authed) {
    const t = u.message?.text?.trim() ?? '';
    sim = await getSim(db, authed).catch(() => null);
    if (sim && simExpired(sim)) {
      await endSim(db, authed).catch(() => {});
      await channel.send(authed, simSummary(sim, 'timeout'), undefined, { kind: 'reply' });
      sim = null; // timed out: this update continues as normal authorized Daniel
    }
    const simButton = u.callback_query?.data === 'ceo:sim:start';
    if (!sim && ((u.message && isSimStart(t)) || simButton)) {
      if (simButton && u.callback_query) await channel.ack({ callbackId: u.callback_query.id, chatId: authed, messageId: u.callback_query.message?.message_id }, '🎭 מפעיל סימולציה…').catch(() => {});
      await startSim(db, authed);
      await db.from('ceo_audit_log').insert({ actor: 'telegram', event: 'stranger_sim_started', detail: { chat_tail: authed.slice(-4), minutes: SIM_MINUTES } }).then(() => null, () => null);
      await channel.send(authed, `🎭 סימולציית זר הופעלה ל-${SIM_MINUTES} דקות.\nמעכשיו אני מתייחס אליך כמו לזר: כל הודעה, פקודה או לחיצה תיחסם עוד לפני ה-AI, בלי מידע ובלי פעולות. נסה לשכנע, להתחזות, ללחוץ על כפתורים — מה שבא לך.\nזר אמיתי לא מקבל שום תשובה; לך אסמן רק שההודעה נחסמה.\nליציאה: "אני מוותר" או "סיום סימולציה".`, undefined, { kind: 'reply' });
      return { simulation: 'started' };
    }
    if (sim && u.message && isSimExit(t)) {
      await endSim(db, authed);
      await db.from('ceo_audit_log').insert({ actor: 'telegram', event: 'stranger_sim_ended', detail: { chat_tail: authed.slice(-4), attempts: sim.attempts?.length ?? 0 } }).then(() => null, () => null);
      await channel.send(authed, simSummary(sim, 'exit'), undefined, { kind: 'reply' });
      return { simulation: 'ended' }; // the exit message itself never reaches the AI
    }
  }
  if (!authed || sim) {
    const kind = simKind(u);
    // silent for strangers, but tell Daniel (once a day per chat) and drop the passkey trust window
    await db.from('ceo_audit_log').insert({ actor: 'telegram', event: 'stranger_blocked', detail: { chat_tail: chatId.slice(-4), from_tail: String(u.message?.from?.id ?? u.callback_query?.from?.id ?? '').slice(-4), kind: u.callback_query ? 'callback' : 'message', ...(sim ? { simulation: true, sim_kind: kind } : {}) } }).then(() => null, () => null);
    if (sim) {
      // same drop as a stranger (no AI, no data, no actions, callbacks rejected) + a visible notice for Daniel only
      await recordSimAttempt(db, sim, kind);
      await invalidateTrust(db, 'stranger simulation').catch(() => {});
      if (u.callback_query) await channel.ack({ callbackId: u.callback_query.id, chatId }).catch(() => {});
      await channel.send(chatId, `🔒 [סימולציה] ההודעה נחסמה\nסיבה: ${SIM_REASON[kind]}`, undefined, { kind: 'reply' }).catch(() => {});
      return { ignored: true, simulation: true };
    }
    const once = await consumeRateLimit({ key: chatId, namespace: 'ceo-stranger', limit: 1, windowSeconds: 86_400 });
    if (once.ok) {
      await invalidateTrust(db, 'unknown chat').catch(() => {});
      for (const id of allowedChatIds()) {
        if (id === chatId) continue; // never answer the blocked sender itself
        await channel.send(id, `⚠️ צ'אט לא מוכר ניסה לדבר עם גדעון (מסתיים ב-${chatId.slice(-4)}). לא קיבל תשובה. אם זה לא אתה, אפשר לכבות את גדעון מ-Ops.`, undefined, { kind: 'security' }).catch(() => {});
      }
    }
    return { ignored: true };
  }

  const sec = await securityState(db);
  const rawText = u.message?.text?.trim() ?? '';
  if (/^\/(lock|kill)$|^(כבה|תכבה) את עצמך$/.test(rawText)) {
    await killSwitch(db, `admin:${chatId}`, 'telegram command');
    await channel.send(chatId, '⛔ גדעון כבוי. כל הפעולות הממתינות בוטלו. הפעלה מחדש: Ops ← גדעון ← אבטחה (דורש Face ID).', undefined, { kind: 'reply' });
    return { killed: true };
  }
  if (detectDeviceChange(rawText)) {
    const replace = /(החלפתי|חדש|נגנב|איבדתי|אבד)/.test(rawText);
    const { existing } = await requestDevice(db, chatId, replace);
    await channel.send(chatId, existing ? 'כבר יש בקשה פתוחה. אשר אותה בלוח הבקרה ונתקדם.' : 'שלחתי לך התראה בלוח הבקרה, תאשר אותה ונתקדם 👍', undefined, { kind: 'reply' });
    return { deviceRequest: true };
  }
  // Ops login approvals: "זה לא אני" works even when Gideon is off; one-tap only in the bootstrap window.
  const lcb = u.callback_query?.data?.match(/^ceo:(la|ld):([0-9a-f-]{36})$/);
  if (lcb && u.callback_query) {
    const { handleLoginCallback } = await import('@/lib/ops/device-callbacks');
    const msg = await handleLoginCallback(db, lcb[1] as 'la' | 'ld', lcb[2], chatId);
    await channel.ack({ callbackId: u.callback_query.id, chatId, messageId: u.callback_query.message?.message_id }, msg);
    return { opsLogin: lcb[1] };
  }
  if (sec.disabled) {
    if (u.callback_query) await channel.ack({ callbackId: u.callback_query.id, chatId });
    else await channel.send(chatId, '⛔ גדעון כבוי כרגע. אפשר להפעיל מחדש מ-Ops ← גדעון ← אבטחה.', undefined, { kind: 'reply' });
    return { disabled: true };
  }

  const rl = await consumeRateLimit({ key: chatId, namespace: 'ceo-min', limit: 20, windowSeconds: 60 });
  const rlDay = await consumeRateLimit({ key: chatId, namespace: 'ceo-day', limit: 300, windowSeconds: 86_400 });
  if (!rl.ok || !rlDay.ok) {
    await channel.send(chatId, 'יותר מדי בקשות, נסה שוב עוד רגע.', undefined, { kind: 'reply' });
    return { limited: true };
  }

  const cb = u.callback_query;
  if (cb?.data?.startsWith('ceo:')) {
    const [, kind, id] = cb.data.split(':');
    if (kind === 'td' || kind === 'ts' || kind === 'tw') {
      const t = await setOwnerTask(db, id, kind === 'td' ? { status: 'done' } : { snoozeDays: kind === 'ts' ? 1 : 7 });
      const msg = !t ? 'המשימה לא נמצאה.' : kind === 'td' ? `✅ סגרתי: ${t.title}` : `⏰ נדחה ל${kind === 'ts' ? 'מחר' : 'שבוע'}: ${t.title}`;
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, msg);
      return { task: kind };
    }
    if (kind === 'ca' || kind === 'cr') {
      const { decideCapability } = await import('./dev-forward');
      const title = await decideCapability(db, id, kind === 'ca');
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, !title ? 'הבקשה כבר טופלה.' : kind === 'ca' ? `✅ אישרת. אורי יבנה: ${title}` : `❌ בוטל: ${title}`);
      return { capability: kind };
    }
    if (kind === 'fd') {
      await channel.ack({ callbackId: cb.id, chatId });
      await channel.typing?.(chatId);
      const { proposeForwardFromDraft, extractFinding } = await import('./dev-forward');
      const r = await proposeForwardFromDraft(db, id, { extract: extractFinding }).catch(() => null);
      if (!r) await channel.send(chatId, 'לא מצאתי את הסיכום הזה. אפשר לכתוב לי מה להעביר לאורי.', undefined, { kind: 'reply' });
      else if ('already' in r) await channel.send(chatId, 'הממצאים מהסיכום הזה כבר הועברו לאורי.', undefined, { kind: 'reply' });
      else if ('none' in r) await channel.send(chatId, 'לא מצאתי בסיכום הזה ממצא טכני להעביר לאורי.', undefined, { kind: 'reply' });
      else {
        const card = approvalCard(r.action);
        await channel.send(chatId, card.text, card.buttons, { kind: 'reply' });
      }
      return { forward: true };
    }
    if (kind === 't') {
      const card = await setActionTarget(db, id, cb.data.split(':')[3] ?? '');
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, card?.text ?? 'הפעולה כבר טופלה או שפג תוקפה.', card?.buttons);
      return { target: Boolean(card) };
    }
    const r = await decideAction(db, id, kind === 'a', `admin:${chatId}`, { edit: kind === 'e' });
    if (r.stepupUrl) {
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, r.text, [
        [{ text: '🔐 אשר עם Face ID', data: '', webApp: r.stepupUrl }],
        [{ text: '❌ דחה', data: `ceo:r:${id}` }],
      ]);
      return { stepup: true };
    }
    if (r.celebrate) {
      // the link gets its own message with a 🎉 effect; the card just flips to "approved"
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, '✅ אושר');
      await channel.send(chatId, r.text, undefined, { effect: 'celebrate', kind: 'reply' });
    } else {
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, r.text);
    }
    return { decided: r.ok };
  }

  const text = u.message?.text?.trim();
  if (!text) return { ignored: true };
  if (text === '/start') {
    await channel.send(chatId, 'שלום דניאל, אני כאן. אפשר לשאול אותי כל דבר על המערכת.', undefined, { kind: 'reply' });
    return { ok: true };
  }
  const sug = suggestCommand(text);
  if (sug) {
    await channel.send(chatId, `לא מכיר את ${text.split(/\s/)[0]}. התכוונת ל-${sug.cmd}?`, sug.callback ? [[{ text: `✅ כן, ${sug.cmd}`, data: sug.callback }]] : undefined, { kind: 'reply' });
    return { suggested: sug.cmd };
  }
  const msgId = u.message?.message_id;
  if (msgId) await channel.react?.(chatId, msgId, '👀');
  await channel.typing?.(chatId);
  const r = await (deps.runTurn ?? runCeoTurn)(db, `${channel.name}:${chatId}`, text.slice(0, 4000));
  await channel.send(chatId, r.text, r.buttons, { kind: 'reply' });
  for (const c of r.cards ?? []) await channel.send(chatId, c.text, c.buttons, { kind: 'reply' });
  return { ok: true };
}
