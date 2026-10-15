import type { SupabaseClient } from '@supabase/supabase-js';
import type { CeoButton } from './channel';
import { TOOL_BY_NAME } from './tools';

export async function audit(db: SupabaseClient, actor: string, event: string, detail: Record<string, unknown> = {}, tool?: string, actionId?: string) {
  await db.from('ceo_audit_log').insert({ actor, event, tool: tool ?? null, action_id: actionId ?? null, detail });
}

/** Store a write as a pending action (24h expiry). Nothing is executed here. */
export async function proposeAction(db: SupabaseClient, tool: string, args: Record<string, unknown>, channel = 'telegram') {
  const t = TOOL_BY_NAME.get(tool);
  if (!t?.write) throw new Error(`not a write tool: ${tool}`);
  const parsed = t.schema.parse(args);
  const summary = await humanizeIds(db, t.summarize?.(parsed) ?? 'פעולה במערכת');
  const { data, error } = await db.from('ceo_pending_actions').insert({ tool, args: parsed, summary, channel }).select('id, summary').single();
  if (error) throw new Error(error.message);
  await audit(db, 'ceo', 'action_proposed', { summary }, tool, data.id);
  return { ...(data as { id: string; summary: string }), destructive: Boolean(t.destructive) };
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Replace user ids with names; drop any other raw ids so cards never show technical identifiers. */
export async function humanizeIds(db: SupabaseClient, text: string): Promise<string> {
  const ids = [...new Set(text.match(UUID_RE) ?? [])];
  if (!ids.length) return text;
  const { data } = await db.from('profiles').select('id, full_name').in('id', ids);
  const names = new Map((data ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name?.trim() || 'משתמש ללא שם']));
  return text
    .replace(UUID_RE, (m) => names.get(m.toLowerCase()) ?? names.get(m) ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,:.])/g, '$1')
    .trim();
}

/** Approval card: short Hebrew, RTL-first, no JSON/table names/hashes. */
export function approvalCard(a: { id: string; summary: string; destructive?: boolean }): { text: string; buttons: CeoButton[][] } {
  const text = `${a.destructive ? '⚠️ **פעולה בלתי הפיכה**\n' : ''}📝 **מחכה לאישור שלך**\n${a.summary}`;
  return {
    text,
    buttons: [[
      { text: '✅ אשר', data: `ceo:a:${a.id}` },
      { text: '✏️ ערוך', data: `ceo:e:${a.id}` },
      { text: '❌ דחה', data: `ceo:r:${a.id}` },
    ]],
  };
}

const fmtIL = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Approve/reject. Atomic claim (status pending → approved) so a double-tap or Telegram retry
 * can never execute twice; expired actions are refused.
 */
export async function decideAction(db: SupabaseClient, id: string, approve: boolean, actor: string, opts: { edit?: boolean } = {}): Promise<{ ok: boolean; text: string }> {
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
  if (!approve) {
    return {
      ok: true,
      text: opts.edit ? `✏️ ${claimed.summary}\nכתוב לי מה לשנות, ואכין טיוטה מעודכנת לאישור.` : `❌ נדחה, לא בוצע כלום.\n${claimed.summary}`,
    };
  }
  const t = TOOL_BY_NAME.get(claimed.tool);
  try {
    if (!t?.write) throw new Error('unknown tool');
    const result = (await t.run(db, t.schema.parse(claimed.args))) as Record<string, unknown> | undefined;
    // secret-bearing results (demo URLs) are shown once and never persisted
    const stored = t.secretResult && result ? { ...result, link: '[redacted]' } : result;
    await db.from('ceo_pending_actions').update({ status: 'done', result: stored }).eq('id', id);
    await audit(db, actor, 'action_done', { result: stored }, claimed.tool, id);
    const link = typeof result?.link === 'string' ? result.link : '';
    const exp = typeof result?.expires_at === 'string' ? `\nבתוקף עד ${fmtIL(result.expires_at)}` : '';
    return { ok: true, text: `✅ בוצע: ${claimed.summary}${link ? `\n${link}` : ''}${exp}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('ceo_pending_actions').update({ status: 'failed', result: { error: msg } }).eq('id', id);
    await audit(db, actor, 'action_failed', { error: msg }, claimed.tool, id);
    console.error('[ceo] action failed', claimed.tool, msg);
    return { ok: false, text: `⚠️ לא הצלחתי לבצע: ${claimed.summary}\nלא בוצע שום שינוי חלקי שדורש טיפול. הפרטים הטכניים נשמרו ביומן, ואפשר לבקש ממני לנסות שוב.` };
  }
}
