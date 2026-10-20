import type { SupabaseClient } from '@supabase/supabase-js';
import type { CeoButton } from './channel';
import { TOOL_BY_NAME } from './tools';
import { createStepupLink, gateApproval, isSensitive } from './security';

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
  return { ...(data as { id: string; summary: string }), destructive: Boolean(t.destructive), sensitive: isSensitive(tool, parsed as Record<string, unknown>, Boolean(t.destructive)), tool, args: parsed as Record<string, unknown> };
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
export function approvalCard(a: { id: string; summary: string; destructive?: boolean; sensitive?: boolean }): { text: string; buttons: CeoButton[][] } {
  const text = `${a.destructive ? '⚠️ **פעולה בלתי הפיכה**\n' : ''}📝 **מחכה לאישור שלך**\n${a.summary}`;
  return {
    text,
    buttons: [[
      { text: a.sensitive ? '🔐 אשר' : '✅ אשר', data: `ceo:a:${a.id}` },
      { text: '✏️ ערוך', data: `ceo:e:${a.id}` },
      { text: '❌ דחה', data: `ceo:r:${a.id}` },
    ]],
  };
}

type Candidate = { id: string; label: string };
/** Demo-link target candidates: the Ops default first, then test/admin accounts (no real users' names in Telegram). */
export async function demoTargetCandidates(db: SupabaseClient): Promise<{ list: Candidate[]; defaultId: string | null }> {
  const { readDemoDefaultTarget } = await import('@/lib/demo-access/create');
  const defaultId = await readDemoDefaultTarget(db).catch(() => null);
  const { data } = await db.from('profiles').select('id, full_name, role').in('role', ['test', 'admin']).limit(5);
  const rows = (data ?? []) as { id: string; full_name: string | null; role: string }[];
  if (defaultId && !rows.some((r) => r.id === defaultId)) {
    const { data: d } = await db.from('profiles').select('id, full_name, role').eq('id', defaultId).maybeSingle();
    if (d) rows.unshift(d as never);
  }
  const roleHe = (r: string) => (r === 'admin' ? 'מנהל' : r === 'test' ? 'בדיקה' : 'משתמש');
  const list = rows
    .sort((a, b) => (a.id === defaultId ? -1 : b.id === defaultId ? 1 : 0))
    .map((r) => ({ id: r.id, label: `${r.full_name?.trim() || 'ללא שם'} · ${roleHe(r.role)}${r.id === defaultId ? ' · ברירת מחדל' : ''}` }));
  return { list, defaultId };
}

/** Card for any pending action; demo links get a target picker (one button per account, ✓ on the selected one). */
export async function approvalCardFor(
  db: SupabaseClient,
  a: { id: string; summary: string; destructive?: boolean; sensitive?: boolean; tool?: string; args?: Record<string, unknown> },
): Promise<{ text: string; buttons: CeoButton[][] }> {
  const card = approvalCard(a);
  if (a.tool !== 'create_demo_link') return card;
  const { list, defaultId } = await demoTargetCandidates(db);
  const selected = (a.args?.targetUserId as string | undefined) ?? defaultId;
  const picker = list.map((c) => [{ text: `${c.id === selected ? '✓ ' : ''}${c.label}`.slice(0, 60), data: `ceo:t:${a.id}:${c.id.slice(0, 8)}` }]);
  const who = list.find((c) => c.id === selected)?.label.split(' · ')[0];
  const text = `${card.text}\n${who ? `חשבון: ${who}` : '⚠️ לא נבחר חשבון, בחר למטה'}\nאפשר להחליף חשבון בכפתורים למטה.`;
  return { text, buttons: [...picker, ...card.buttons] };
}

/** Change the target account of a pending demo-link action (from the picker). */
export async function setActionTarget(db: SupabaseClient, id: string, idPrefix: string) {
  const { data: act } = await db.from('ceo_pending_actions').select('id, tool, args, status, expires_at').eq('id', id).maybeSingle();
  if (!act || act.status !== 'pending' || act.tool !== 'create_demo_link' || String(act.expires_at) <= new Date().toISOString()) return null;
  const { list } = await demoTargetCandidates(db);
  const pick = list.find((c) => c.id.startsWith(idPrefix));
  if (!pick) return null;
  const t = TOOL_BY_NAME.get('create_demo_link')!;
  const args = t.schema.parse({ ...(act.args as Record<string, unknown>), targetUserId: pick.id });
  const summary = await humanizeIds(db, t.summarize?.(args) ?? 'קישור דמו');
  await db.from('ceo_pending_actions').update({ args, summary }).eq('id', id).eq('status', 'pending');
  await audit(db, 'admin', 'action_target_changed', {}, 'create_demo_link', id);
  return approvalCardFor(db, { id, summary, tool: 'create_demo_link', args });
}

const fmtIL = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Approve/reject. Atomic claim (status pending → approved) so a double-tap or Telegram retry
 * can never execute twice; expired actions are refused.
 */
export async function decideAction(
  db: SupabaseClient,
  id: string,
  approve: boolean,
  actor: string,
  opts: { edit?: boolean; stepupVerified?: boolean } = {},
): Promise<{ ok: boolean; text: string; celebrate?: boolean; stepupUrl?: string }> {
  const now = new Date().toISOString();
  if (approve) {
    const { data: pend } = await db.from('ceo_pending_actions').select('tool, args, status').eq('id', id).maybeSingle();
    if (pend && pend.status === 'pending') {
      const t0 = TOOL_BY_NAME.get(String(pend.tool));
      const sensitive = isSensitive(String(pend.tool), (pend.args ?? {}) as Record<string, unknown>, Boolean(t0?.destructive));
      const g = opts.stepupVerified ? await gateApproval(db, false, Date.now(), { skipStepup: true }) : await gateApproval(db, sensitive);
      if (!g.ok) {
        await audit(db, actor, `approval_blocked_${g.reason}`, {}, String(pend.tool), id);
        if (g.reason === 'stepup') return { ok: false, text: g.text, stepupUrl: await createStepupLink(db, 'approve', { actionId: id }) };
        return { ok: false, text: g.text };
      }
    }
  }
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
    if (claimed.tool === 'forward_to_developer') return { ok: true, text: `העברתי לאורי ✅\n${claimed.summary.replace(/^להעביר לאורי:\s*/, '')}` };
    const link = typeof result?.link === 'string' ? result.link : '';
    const exp = typeof result?.expires_at === 'string' ? `\nבתוקף עד ${fmtIL(result.expires_at)}` : '';
    return { ok: true, text: `✅ בוצע: ${claimed.summary}${link ? `\n${link}` : ''}${exp}`, celebrate: claimed.tool === 'create_demo_link' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('ceo_pending_actions').update({ status: 'failed', result: { error: msg } }).eq('id', id);
    await audit(db, actor, 'action_failed', { error: msg }, claimed.tool, id);
    console.error('[ceo] action failed', claimed.tool, msg);
    const userFacing = /[\u0590-\u05FF]/.test(msg) ? `\n${msg}` : '';
    return { ok: false, text: `⚠️ לא הצלחתי לבצע: ${claimed.summary}${userFacing}\nהפרטים הטכניים נשמרו ביומן. אפשר לבקש ממני לבדוק מה קרה, או לנסות שוב.` };
  }
}
