import type { SupabaseClient } from '@supabase/supabase-js';
import type { CeoButton } from './channel';
import { listPrefs } from './prefs';
import { DEFAULT_SHABBAT, fmtIl, quietState, type OwnerPref } from './quiet';

/**
 * The single outbound gate. Every Telegram send goes through createTelegramChannel().send, which calls
 * this gate for anything that is not a direct reply to Daniel. Standing instructions are enforced HERE
 * (code), not in the prompt: quiet windows hold the message in gideon_outbox and it is delivered after
 * the window ends (several → one combined message); muted topics are dropped.
 */
export type OutKind =
  | 'reply' // direct answer to Daniel's own message / button / Ops action → always delivered
  | 'outbox' // delivery of held messages (already gated)
  | 'digest' | 'alert' | 'reminder' | 'report' | 'security' | 'notice';
export type OutMeta = { kind?: OutKind; topic?: string };
export type Decision = { action: 'send' } | { action: 'hold'; until: Date; reason: string } | { action: 'drop'; reason: string };

export function decideOutbound(prefs: OwnerPref[], meta: OutMeta, now = new Date()): Decision {
  const kind = meta.kind ?? 'notice';
  if (kind === 'reply' || kind === 'outbox') return { action: 'send' };
  const topic = meta.topic ?? kind;
  if (kind !== 'security') {
    const mute = prefs.find((p) => p.active && p.kind === 'mute_topic' && ((p.params.topics as string[]) ?? []).includes(topic));
    if (mute) return { action: 'drop', reason: `muted:${topic}` };
  }
  const q = quietState(prefs, now);
  if (!q.quiet) return { action: 'send' };
  if (kind === 'security' && q.emergencies === 'allow') return { action: 'send' };
  return { action: 'hold', until: q.until, reason: q.reasons.join('+') };
}

/** If prefs can't be read, keep the Shabbat promise (last known prefs, else the default Shabbat rule). */
const FAILSAFE: OwnerPref[] = [{ id: 'failsafe', kind: 'shabbat', label: 'failsafe', params: { ...DEFAULT_SHABBAT }, active: true }];
let lastKnown: OwnerPref[] | null = null;
export async function loadPrefsSafe(db: SupabaseClient | null): Promise<OwnerPref[]> {
  if (db) {
    try {
      lastKnown = await listPrefs(db);
      return lastKnown;
    } catch {
      /* fall through */
    }
  }
  return lastKnown ?? FAILSAFE;
}
export function _resetPrefsCache() {
  lastKnown = null;
}

const auditRow = (db: SupabaseClient, event: string, detail: Record<string, unknown>) =>
  db.from('ceo_audit_log').insert({ actor: 'gate', event, detail }).then(() => null, () => null);

const storableButtons = (b?: CeoButton[][]) => {
  // Mini App (Face ID) buttons are one-time and expire in minutes → never held
  const rows = (b ?? []).map((r) => r.filter((x) => !x.webApp)).filter((r) => r.length);
  return rows.length ? rows : null;
};

export type GateMsg = { chatId: string; text: string; buttons?: CeoButton[][] } & OutMeta;
export type GateResult = 'send' | 'held' | 'dropped';
export type OutboundGate = (m: GateMsg) => Promise<GateResult>;

export function createDbGate(getDb: () => SupabaseClient | Promise<SupabaseClient>, deps: { now?: () => Date; schedule?: (at: Date) => Promise<unknown> } = {}): OutboundGate {
  return async (m) => {
    let db: SupabaseClient | null = null;
    try {
      db = await getDb();
    } catch {
      db = null;
    }
    const now = deps.now?.() ?? new Date();
    const d = decideOutbound(await loadPrefsSafe(db), m, now);
    if (d.action === 'send') return 'send';
    if (d.action === 'drop') {
      if (db) await auditRow(db, 'outbound_dropped', { kind: m.kind, topic: m.topic, reason: d.reason });
      return 'dropped';
    }
    if (!db) {
      console.error('[gideon-gate] quiet time and no DB to hold the message; not sending', m.kind);
      return 'dropped';
    }
    const { error } = await db.from('gideon_outbox').insert({ chat_id: m.chatId, kind: m.kind ?? 'notice', topic: m.topic ?? null, text: m.text, buttons: storableButtons(m.buttons), reason: d.reason, deliver_after: d.until.toISOString() });
    if (error) {
      console.error('[gideon-gate] hold failed; not sending during quiet time', error.message);
      return 'dropped';
    }
    await auditRow(db, 'outbound_held', { kind: m.kind, topic: m.topic, reason: d.reason, until: d.until.toISOString() });
    await (deps.schedule ?? scheduleFlush)(d.until).catch(() => null);
    return 'held';
  };
}

/** Lazily-bound production gate (service-role client). */
export const defaultGate: OutboundGate = createDbGate(async () => (await import('@/lib/supabase/admin')).createAdminClient());

type OutRow = { id: number; chat_id: string; kind: string; topic: string | null; text: string; buttons: CeoButton[][] | null; created_at: string };

export function composeHeld(rows: OutRow[]): { text: string; buttons?: CeoButton[][] } {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const buttons = sorted.flatMap((r) => r.buttons ?? []).slice(0, 8);
  if (sorted.length === 1) return { text: sorted[0].text, buttons: buttons.length ? buttons : undefined };
  const body = sorted.map((r) => `🕓 ${fmtIl(new Date(r.created_at))}\n${r.text}`).join('\n\n━━━━━━━━\n\n');
  return { text: `📬 מה שחיכה לך בזמן השקט (${sorted.length} הודעות):\n\n${body}`, buttons: buttons.length ? buttons : undefined };
}

/**
 * Deliver held messages once quiet time is over (or `force` from Ops). Claims rows atomically
 * (status held → sending) so parallel runs never double-send; one combined message per chat.
 */
export async function flushOutbox(
  db: SupabaseClient,
  send: (chatId: string, text: string, buttons?: CeoButton[][]) => Promise<void>,
  opts: { now?: Date; force?: boolean } = {},
): Promise<{ sent: number; messages: number; quietUntil?: string; skipped?: string }> {
  const now = opts.now ?? new Date();
  if (!opts.force) {
    let prefs: OwnerPref[];
    try {
      prefs = await listPrefs(db);
    } catch {
      return { sent: 0, messages: 0, skipped: 'prefs_unavailable' };
    }
    const q = quietState(prefs, now);
    if (q.quiet) return { sent: 0, messages: 0, quietUntil: q.until.toISOString() };
  }
  const stamp = { status: 'sending', claimed_at: now.toISOString() };
  const fresh = await db.from('gideon_outbox').update(stamp).eq('status', 'held').select('*');
  const stale = await db.from('gideon_outbox').update(stamp).eq('status', 'sending').lt('claimed_at', new Date(now.getTime() - 10 * 60_000).toISOString()).select('*');
  const rows = [...((fresh.data ?? []) as OutRow[]), ...((stale.data ?? []) as OutRow[])];
  const byChat = new Map<string, OutRow[]>();
  for (const r of rows) byChat.set(r.chat_id, [...(byChat.get(r.chat_id) ?? []), r]);
  let sent = 0;
  for (const [chat, list] of byChat) {
    const ids = list.map((r) => r.id);
    try {
      const m = composeHeld(list);
      await send(chat, m.text, m.buttons);
      await db.from('gideon_outbox').delete().in('id', ids);
      sent++;
    } catch {
      await db.from('gideon_outbox').update({ status: 'held', claimed_at: null }).in('id', ids);
    }
  }
  if (rows.length) await auditRow(db, 'outbox_flushed', { chats: sent, messages: rows.length, force: Boolean(opts.force) });
  return { sent, messages: rows.length };
}

/** Delayed QStash call to one of our cron routes (deduplicated). */
export async function publishDelayed(path: string, notBefore: number, dedupeId: string, retries = 1): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const { workflowPublicBaseUrl } = await import('@/lib/workflows/resolve-workflow-public-url');
  const base = workflowPublicBaseUrl();
  if (!token || !base) return { ok: false, reason: 'qstash_or_base_missing' };
  const api = (process.env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const dest = `${base.replace(/\/$/, '')}${path}`;
  const r = await fetch(`${api}/v2/publish/${encodeURIComponent(dest)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Upstash-Method': 'POST', 'Upstash-Not-Before': String(notBefore), 'Upstash-Retries': String(retries), 'Upstash-Deduplication-Id': dedupeId },
  }).catch(() => null);
  return r?.ok ? { ok: true } : { ok: false, reason: `qstash_${r?.status ?? 'error'}` };
}

/** Flush one minute after quiet ends (tzeit + 1 min for Shabbat). */
export function scheduleFlush(until: Date) {
  const at = Math.ceil(until.getTime() / 60_000) * 60 + 60;
  return publishDelayed('/api/v1/ai/cron/ceo-outbox-flush', at, `ceo-outbox-flush-${at}`, 2);
}
