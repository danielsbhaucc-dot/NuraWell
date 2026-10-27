/** Cron: run rule-based anomaly detection and alert Gideon's owner chat. Deduped per anomaly key (24h). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { detectAnomalies, explain } from './insights';
import { knownPlaces, loadEvents } from './load';

export async function runAnomalyAlerts(db: SupabaseClient, now = Date.now()): Promise<number> {
  const evs = (await loadEvents(db, new Date(now - 86_400_000).toISOString(), undefined, 1000)).map(explain);
  const found = detectAnomalies(evs, await knownPlaces(db, new Date(now - 86_400_000).toISOString()), now).filter((a) => a.severity >= 7);
  if (!found.length) return 0;
  const { data: prev } = await db.from('ops_security_events').select('facts').eq('kind', 'anomaly').gte('created_at', new Date(now - 86_400_000).toISOString());
  const seen = new Set(((prev ?? []) as { facts: { key?: string } | null }[]).map((p) => p.facts?.key));
  const { createTelegramChannel } = await import('@/lib/module-api/gideon/lib-ceo-telegram');
  const { allowedChatIds } = await import('@/lib/module-api/gideon/lib-ceo-channel');
  const ch = createTelegramChannel();
  let n = 0;
  for (const a of found) {
    if (seen.has(a.key)) continue;
    // record first (idempotent across overlapping crons); alerted_at set so the generic dispatcher skips it
    await db.from('ops_security_events').insert({ kind: 'anomaly', facts: { key: a.key, severity: a.severity }, detail: { title: a.title }, alerted_at: new Date().toISOString() });
    const text = `🚨 ${a.title}\n${a.why}\n\nמה לעשות: ${a.todo}\nפרטים: יומנים ← יומן פעילות ב-Ops.`;
    // severity 9+: immediate (bypass quiet/Shabbat like other security alerts); else standard gate (Shabbat/quiet respected → queued)
    for (const id of allowedChatIds()) await ch.send(id, text, undefined, { kind: a.severity >= 9 ? 'reply' : 'notice', topic: 'security' }).catch(() => undefined);
    n += 1;
  }
  return n;
}
