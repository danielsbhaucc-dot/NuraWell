import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOL_BY_NAME } from './tools';

export async function audit(db: SupabaseClient, actor: string, event: string, detail: Record<string, unknown> = {}, tool?: string, actionId?: string) {
  await db.from('ceo_audit_log').insert({ actor, event, tool: tool ?? null, action_id: actionId ?? null, detail });
}

/** Store a write as a pending action (24h expiry). Nothing is executed here. */
export async function proposeAction(db: SupabaseClient, tool: string, args: Record<string, unknown>, channel = 'telegram') {
  const t = TOOL_BY_NAME.get(tool);
  if (!t?.write) throw new Error(`not a write tool: ${tool}`);
  const parsed = t.schema.parse(args);
  const summary = `${t.destructive ? '⚠️ בלתי הפיך! ' : ''}${t.summarize?.(parsed) ?? tool}`;
  const { data, error } = await db.from('ceo_pending_actions').insert({ tool, args: parsed, summary, channel }).select('id, summary').single();
  if (error) throw new Error(error.message);
  await audit(db, 'ceo', 'action_proposed', { summary }, tool, data.id);
  return data as { id: string; summary: string };
}

/**
 * Approve/reject. Atomic claim (status pending → approved) so a double-tap or Telegram retry
 * can never execute twice; expired actions are refused.
 */
export async function decideAction(db: SupabaseClient, id: string, approve: boolean, actor: string): Promise<{ ok: boolean; text: string }> {
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from('ceo_pending_actions')
    .update({ status: approve ? 'approved' : 'rejected', decided_at: now })
    .eq('id', id)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .select('id, tool, args, summary')
    .maybeSingle();
  if (!claimed) return { ok: false, text: 'הפעולה כבר טופלה או שפג תוקפה.' };
  await audit(db, actor, approve ? 'action_approved' : 'action_rejected', {}, claimed.tool, id);
  if (!approve) return { ok: true, text: `❌ בוטל: ${claimed.summary}` };
  const t = TOOL_BY_NAME.get(claimed.tool);
  try {
    if (!t?.write) throw new Error('unknown tool');
    const result = await t.run(db, t.schema.parse(claimed.args));
    await db.from('ceo_pending_actions').update({ status: 'done', result }).eq('id', id);
    await audit(db, actor, 'action_done', { result }, claimed.tool, id);
    const link = (result as { link?: string })?.link;
    return { ok: true, text: `✅ בוצע: ${claimed.summary}${link ? `\n${link}` : ''}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('ceo_pending_actions').update({ status: 'failed', result: { error: msg } }).eq('id', id);
    await audit(db, actor, 'action_failed', { error: msg }, claimed.tool, id);
    return { ok: false, text: `⚠️ נכשל: ${claimed.summary}\n${msg}` };
  }
}
