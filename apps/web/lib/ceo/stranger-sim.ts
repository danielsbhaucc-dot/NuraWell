import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptTelegramId, sealTelegramId, telegramIdBidx } from '@/lib/ceo/telegram-id-seal';

/**
 * Stranger simulation: Daniel (authorized sender only) can make Gideon treat him as a stranger for
 * 30 minutes. State is server-side (public.gideon_stranger_sim, per chat). While active every update
 * goes through the stranger path; the only extra is a short notice. It can never raise privileges:
 * start/exit are checked only after authorizedSender() passed, and exit just deletes the row.
 * chat_id sealed at rest; lookups via keyed chat_bidx; Surrogate UUID PK.
 */
export const SIM_MINUTES = 30;
const START = new Set(['/סימולציה', '/simulate']);
const EXIT = new Set(['אני מוותר', 'סיום סימולציה']);
const SIM_WORD = /(סימולציה|סימולציית\s*זר|simulat(e|ion))/i;
const SIM_VERB = /(תעשה|תעשי|עשה|הפעל|תפעיל|תפעילי|תריץ|הרץ|תתחיל|התחל|נתחיל|בוא\s+נעשה|תכנס|רוצה|אפשר|start|run|do|begin|let'?s)/i;
const AS_STRANGER = /(תבדוק|בדוק|תבחן|תתייחס)\s+(אליי|אלי|אותי)\s+(כזר|כמו\s+(ל)?זר)|תעמיד\s+פנים\s+שאני\s+זר|test\s+me\s+as\s+a\s+stranger/i;
const NEG = /(אל\s+ת|לא\s+צריך|בלי\s+סימולציה|don'?t|do\s+not)/i;
const QUESTION = /^(מה|איך|למה|מתי|האם|כמה|what|how|why|when)\b|\?/i;

export function isSimStartNatural(text: string): boolean {
  const t = text.trim().replace(/^גדעון[\s,:]*/, '').replace(/[.!]+$/, '').trim();
  if (!t || t.length > 80 || t.includes('/') || NEG.test(t) || QUESTION.test(t)) return false;
  if (AS_STRANGER.test(t)) return true;
  if (/^(סימולציה|simulate|simulation)(\s+(עכשיו|בבקשה|please|now))?$/i.test(t)) return true;
  return SIM_WORD.test(t) && SIM_VERB.test(t) && !/סיום|יציאה|תסיים|תעצור|stop|end/i.test(t);
}
export const isSimStart = (t: string) => START.has(t.trim().replace(/@\w+$/, '')) || isSimStartNatural(t);
export const isSimExit = (t: string) => EXIT.has(t.trim());

export type SimAttempt = { at: string; kind: SimKind };
export type SimKind = 'text' | 'command' | 'button' | 'media';
/** chat_id here is always plaintext in memory after authorized decrypt. */
export type Sim = { chat_id: string; started_at: string; expires_at: string; attempts: SimAttempt[] };

export const SIM_REASON: Record<SimKind, string> = {
  text: 'הודעה משולח לא מאומת',
  command: 'פקודה משולח לא מאומת',
  button: 'לחיצת כפתור / אישור פעולה משולח לא מאומת',
  media: 'תוכן משולח לא מאומת',
};

export function simKind(u: { message?: { text?: string }; callback_query?: unknown }): SimKind {
  if (u.callback_query) return 'button';
  const t = u.message?.text?.trim();
  if (!t) return 'media';
  return t.startsWith('/') ? 'command' : 'text';
}

export async function getSim(db: SupabaseClient, chatId: string): Promise<Sim | null> {
  let bidx: string;
  try {
    bidx = telegramIdBidx('gideon_stranger_sim', 'chat_id', chatId);
  } catch {
    return null;
  }
  const { data } = await db.from('gideon_stranger_sim').select('chat_id, chat_bidx, started_at, expires_at, attempts').eq('chat_bidx', bidx).maybeSingle();
  const row = data as { chat_id: string; started_at: string; expires_at: string; attempts: SimAttempt[] } | null;
  if (!row) return null;
  const plain = await decryptTelegramId('gideon_stranger_sim', 'chat_id', row.chat_id);
  if (!plain) return null;
  return { chat_id: plain, started_at: row.started_at, expires_at: row.expires_at, attempts: row.attempts ?? [] };
}

export async function startSim(db: SupabaseClient, chatId: string, now = new Date()) {
  const expires_at = new Date(now.getTime() + SIM_MINUTES * 60_000).toISOString();
  let sealed: string;
  let bidx: string;
  try {
    ({ sealed, bidx } = await sealTelegramId('gideon_stranger_sim', 'chat_id', chatId));
  } catch {
    throw new Error('sim start failed');
  }
  const { error } = await db.from('gideon_stranger_sim').upsert(
    { chat_id: sealed, chat_bidx: bidx, started_at: now.toISOString(), expires_at, attempts: [] },
    { onConflict: 'chat_bidx' },
  );
  if (error) throw new Error('sim start failed');
}

export async function recordSimAttempt(db: SupabaseClient, sim: Sim, kind: SimKind, now = new Date()) {
  const attempts = [...(sim.attempts ?? []), { at: now.toISOString(), kind }].slice(-200);
  sim.attempts = attempts;
  let bidx: string;
  try {
    bidx = telegramIdBidx('gideon_stranger_sim', 'chat_id', sim.chat_id);
  } catch {
    return;
  }
  await db.from('gideon_stranger_sim').update({ attempts }).eq('chat_bidx', bidx).then(() => null, () => null);
}

export async function endSim(db: SupabaseClient, chatId: string) {
  let bidx: string;
  try {
    bidx = telegramIdBidx('gideon_stranger_sim', 'chat_id', chatId);
  } catch {
    return;
  }
  await db.from('gideon_stranger_sim').delete().eq('chat_bidx', bidx);
}

export const simExpired = (s: Sim, now = new Date()) => new Date(s.expires_at).getTime() <= now.getTime();

export function simSummary(s: Sim, why: 'exit' | 'timeout'): string {
  const a = s.attempts ?? [];
  const by = (k: SimKind) => a.filter((x) => x.kind === k).length;
  const lines = [
    why === 'exit' ? '🔓 הסימולציה הסתיימה. חזרת להיות דניאל המאומת.' : `⏱️ הסימולציה הסתיימה אוטומטית אחרי ${SIM_MINUTES} דקות.`,
    `ניסיונות: ${a.length}${a.length ? ' — כולם נחסמו ✅' : ''}`,
  ];
  if (by('text')) lines.push(`• הודעות טקסט: ${by('text')}`);
  if (by('command')) lines.push(`• פקודות: ${by('command')}`);
  if (by('button')) lines.push(`• לחיצות כפתור / אישורים: ${by('button')}`);
  if (by('media')) lines.push(`• תוכן אחר: ${by('media')}`);
  lines.push('שום ניסיון לא הגיע ל-AI, לא קיבל מידע ולא הפעיל פעולה.');
  return lines.join('\n');
}
