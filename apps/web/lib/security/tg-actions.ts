/**
 * One-tap *defensive* Telegram buttons on the new-IP/country alert:
 *   "✅ זה אני"     → mark the IP as a known place (no more alerts from it).
 *   "🚫 זה לא אני" → revoke that session, block the IP for 24h, open an incident.
 * Nothing that loosens security is reachable from here (unlock, unban, lift lockdown, allowlist): those need
 * step-up + a recovery code in Ops.
 * Callback data: `ceo:sk:<id>.<mac>` / `ceo:sx:<id>.<mac>` (≤ 64 bytes). mac = HMAC(secret, kind|id), the DB keeps
 * only sha256(mac). Single use (atomic used_at), TTL 30 min, private chat ids from the env allowlist only,
 * webhook secret header already verified by the route. Every outcome is audit-logged.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { macFor as coreMac, newNonceId, verifyToken as coreVerify } from '@/lib/security-core/signed-actions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allowedChatIds, type CeoButton } from '@/lib/ceo/channel';
import { blockIp, irAudit, revokeSession, type Actor } from './ir';

export const TG_ACTION_TTL_MS = 30 * 60_000;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function key(): string {
  const k = process.env.TG_ACTION_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!k) throw new Error('no signing key');
  return k;
}
export const macFor = (kind: 'sk' | 'sx', id: string, k = key()) => coreMac(kind, id, k);

export const verifyToken = (kind: 'sk' | 'sx', token: string, k = key()) => coreVerify(kind, token, k);

export async function createAlertButtons(db: SupabaseClient, o: { userId: string; sessionId: string | null; ipHash: string; country: string | null }): Promise<CeoButton[][] | undefined> {
  try {
    const id = newNonceId();
    const sk = macFor('sk', id); const sx = macFor('sx', id);
    const { error } = await db.from('tg_action_nonces').insert({ id, expires_at: new Date(Date.now() + TG_ACTION_TTL_MS).toISOString(), nonce_hash: sha(`${sk}|${sx}`), subject_user: o.userId, session_id: o.sessionId, ip_hash: o.ipHash, country: o.country });
    if (error) return undefined;
    return [[{ text: '✅ זה אני', data: `ceo:sk:${id}.${sk}` }, { text: '🚫 זה לא אני', data: `ceo:sx:${id}.${sx}` }]];
  } catch { return undefined; }
}

export type TgOutcome = { ok: boolean; text: string };

/** Webhook handler for `ceo:sk|sx:<token>`. chatId must be an env-allowlisted private chat. */
export async function handleAlertCallback(db: SupabaseClient, kind: 'sk' | 'sx', token: string, chatId: string): Promise<TgOutcome> {
  const sys: Actor = { userId: '00000000-0000-0000-0000-000000000000', sessionId: null, ipHash: null };
  if (!allowedChatIds().has(chatId)) {
    await db.from('ops_security_events').insert({ kind: 'tg_action_refused', detail: { reason: 'chat', kind } });
    return { ok: false, text: 'לא מורשה.' };
  }
  const id = verifyToken(kind, token);
  if (!id) {
    await db.from('ops_security_events').insert({ kind: 'tg_action_refused', detail: { reason: 'signature', kind } });
    return { ok: false, text: 'הכפתור לא תקין.' };
  }
  const now = new Date().toISOString();
  const { data } = await db.from('tg_action_nonces').update({ used_at: now }).eq('id', id).is('used_at', null).gt('expires_at', now).select('subject_user, session_id, ip_hash, country, nonce_hash').maybeSingle();
  const n = data as { subject_user: string | null; session_id: string | null; ip_hash: string | null; country: string | null; nonce_hash: string } | null;
  if (n && n.nonce_hash !== sha(`${macFor('sk', id)}|${macFor('sx', id)}`)) {
    await db.from('ops_security_events').insert({ kind: 'tg_action_refused', detail: { reason: 'nonce_mismatch', kind, id } });
    return { ok: false, text: 'הכפתור לא תקין.' };
  }
  if (!n) {
    await db.from('ops_security_events').insert({ kind: 'tg_action_refused', detail: { reason: 'used_or_expired', kind, id } });
    return { ok: false, text: 'הכפתור כבר שומש או שפג תוקפו (30 דקות). אפשר לטפל במסך היומנים ב-Ops.' };
  }
  const actor: Actor = { ...sys, userId: n.subject_user ?? sys.userId };
  if (kind === 'sk') {
    if (n.ip_hash) await db.from('ops_known_places').upsert({ ip_hash: n.ip_hash, via: 'telegram' });
    await irAudit(db, actor, 'tg_mark_known', { via: 'telegram', target_ip_hash: n.ip_hash, country: n.country });
    return { ok: true, text: '✅ סומן כמקום מוכר. לא אתריע שוב על הכתובת הזו.' };
  }
  const { data: inc } = await db.from('security_incidents').insert({ opened_via: 'telegram', subject_user: n.subject_user, session_id: n.session_id, ip_hash: n.ip_hash }).select('id').single();
  const incidentId = (inc as { id: string } | null)?.id ?? null;
  const done: string[] = [];
  if (n.session_id) { const r = await revokeSession(db, actor, n.session_id, incidentId); if (r.ok) done.push('החיבור נותק'); }
  if (n.ip_hash) { const r = await blockIp(db, actor, { ipHash: n.ip_hash, minutes: 24 * 60, note: 'telegram: not me' }, incidentId); if (r.ok) done.push('הכתובת נחסמה ל-24 שעות'); }
  await db.from('ops_known_places').delete().eq('ip_hash', n.ip_hash ?? '');
  await irAudit(db, actor, 'tg_not_me', { via: 'telegram', incident: incidentId, done }, incidentId);
  const ref = incidentId ? incidentId.slice(0, 8) : '';
  return { ok: true, text: `🚫 טופל: ${done.join(', ') || 'לא נמצא חיבור פעיל'}.\nנפתח אירוע ${ref}. לחקירה: Ops ← משפטי ← אבטחה ופרטיות ← יומנים (האירוע ייפתח אוטומטית). שם גם: ניתוק כל החיבורים, החלפת סיסמה ונעילת חירום.` };
}
