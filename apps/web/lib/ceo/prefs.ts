import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CITY_HE, DEFAULT_SHABBAT, fmtIl, holyWindows, resolveUntil, shabbatParams, type OwnerPref, type PrefKind } from './quiet';

/**
 * Daniel's standing instructions to Gideon (public.gideon_owner_prefs). Everything except `note` is
 * ENFORCED in code at the Telegram send layer (outbound.ts); notes are loaded into every turn.
 */
export const MUTABLE_TOPICS = ['daily', 'weekly', 'monthly', 'cost', 'owner_tasks', 'agent_report', 'dev_forward'] as const;
export const TOPIC_HE: Record<string, string> = {
  daily: 'עדכון יומי', weekly: 'סיכום שבועי', monthly: 'דוח חודשי', cost: 'התראות עלות', owner_tasks: 'תזכורות משימות', agent_report: 'דיווחי סוכן התוכן', dev_forward: 'עדכונים מאור על משימות שהועברו', security: 'התראות אבטחה',
};
const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HHMM = z.string().regex(/^([01]?\d|2[0-3]):([0-5]\d)$/, 'שעה בפורמט HH:MM');

/** Input shape shared by Gideon's tool and the Ops API. */
export const PrefInput = z.object({
  kind: z.enum(['shabbat', 'quiet_hours', 'quiet_until', 'mute_topic', 'note']),
  label: z.string().trim().min(2).max(200).describe("Daniel's instruction, short Hebrew, in his words"),
  active: z.boolean().default(true),
  yom_tov: z.boolean().optional().describe('shabbat: also Yom Tov (default true)'),
  from: HHMM.optional().describe('quiet_hours: start HH:MM Israel time'),
  to: HHMM.optional().describe('quiet_hours: end HH:MM Israel time'),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional().describe('quiet_hours: weekdays the window STARTS on, 0=Sunday; omit = every day'),
  until: z.string().max(40).optional().describe('quiet_until: end_of_shabbat | end_of_today | tomorrow_morning | ISO timestamp with offset'),
  topics: z.array(z.enum(MUTABLE_TOPICS)).min(1).max(7).optional().describe('mute_topic: which automatic messages to stop'),
  note: z.string().max(400).optional().describe('note: a behavioral instruction that is not about sending (remembered every turn, not code-enforced)'),
});
export type PrefInput = z.infer<typeof PrefInput>;

/** Ops-only extra fields (never settable by Gideon: emergencies policy, Shabbat city/minutes). */
export const OpsShabbatInput = z.object({
  active: z.boolean(),
  city: z.string().refine((c) => c in CITY_HE, 'עיר לא נתמכת'),
  candle_mins: z.number().int().min(0).max(60),
  yom_tov: z.boolean(),
  emergencies: z.enum(['hold', 'allow']),
});

const rowToPref = (r: Record<string, unknown>): OwnerPref => ({
  id: String(r.id), kind: r.kind as PrefKind, label: String(r.label ?? ''), params: (r.params as Record<string, unknown>) ?? {}, active: r.active !== false, source: r.source as string, expires_at: (r.expires_at as string) ?? null,
});

export async function listPrefs(db: SupabaseClient, opts: { includeInactive?: boolean } = {}): Promise<OwnerPref[]> {
  let q = db.from('gideon_owner_prefs').select('id, kind, label, params, active, source, expires_at, created_at').order('created_at', { ascending: true });
  if (!opts.includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? []).map(rowToPref).filter((p) => opts.includeInactive || !p.expires_at || Date.parse(p.expires_at) > now);
}

/** Human description of what is enforced, in Hebrew (used for confirmations, list, Ops). */
export function describePref(p: OwnerPref, now = new Date()): string {
  const prm = p.params;
  switch (p.kind) {
    case 'shabbat': {
      const s = shabbatParams(prm);
      const next = holyWindows(now, new Date(now.getTime() + 8 * 86_400_000), s)[0];
      return `🕯️ שקט בשבת${s.yom_tov ? ' ובחגים' : ''}: מהדלקת נרות (${s.candle_mins} דק' לפני השקיעה, ${CITY_HE[s.city] ?? s.city}) עד צאת השבת. הודעות שיצטברו יגיעו אחרי צאת השבת בהודעה אחת${s.emergencies === 'allow' ? '. התראות אבטחה דחופות עוברות' : ', כולל התראות אבטחה'}.${next ? ` הבא: ${fmtIl(next.start)} עד ${fmtIl(next.end)}.` : ''}`;
    }
    case 'quiet_hours': {
      const days = Array.isArray(prm.days) && prm.days.length ? ` בימי ${(prm.days as number[]).map((d) => DAY_HE[d]).join(', ')}` : ' כל יום';
      return `🌙 שעות שקט ${prm.from}–${prm.to}${days}. הודעות שיצטברו יגיעו בסוף השקט${prm.emergencies === 'allow' ? ' (התראות אבטחה עוברות)' : ''}.`;
    }
    case 'quiet_until':
      return `🤫 בלי הודעות עד ${fmtIl(new Date(String(prm.until)))}. מה שיצטבר יגיע אחר כך${prm.emergencies === 'allow' ? ' (התראות אבטחה עוברות)' : ''}.`;
    case 'mute_topic':
      return `🔕 לא לשלוח: ${((prm.topics as string[]) ?? []).map((t) => TOPIC_HE[t] ?? t).join(', ')}.`;
    case 'note':
      return `📝 ${String(prm.note ?? p.label)} (נזכר בכל שיחה, לא נאכף בקוד)`;
  }
}

/** Validate + persist. Throws a Hebrew error when the instruction can't be stored/enforced. */
/**
 * Quiet hours / quiet-until created via Gideon (Telegram) always let security alerts through, so a stolen
 * phone can't silence the alarms. Only Shabbat's emergencies policy (Ops) or an Ops-made rule can hold them.
 */
export async function savePref(db: SupabaseClient, input: PrefInput, source: 'gideon' | 'ops', now = new Date(), extra: { emergencies?: 'hold' | 'allow' } = {}): Promise<OwnerPref> {
  const emergencies = source === 'gideon' ? 'allow' : (extra.emergencies ?? 'hold');
  const a = PrefInput.parse(input);
  const nowIso = now.toISOString();
  if (a.kind === 'shabbat') {
    const { data: prev } = await db.from('gideon_owner_prefs').select('id, params').eq('kind', 'shabbat').maybeSingle();
    const params = { ...DEFAULT_SHABBAT, ...((prev?.params as object) ?? {}), ...(a.yom_tov === undefined ? {} : { yom_tov: a.yom_tov }) };
    const row = { kind: 'shabbat', label: a.label, params, active: a.active, source, updated_at: nowIso };
    const r = prev
      ? await db.from('gideon_owner_prefs').update(row).eq('id', prev.id).select('*').single()
      : await db.from('gideon_owner_prefs').insert(row).select('*').single();
    if (r.error || !r.data) throw new Error(`השמירה נכשלה: ${r.error?.message ?? 'no row'}`);
    return rowToPref(r.data);
  }
  let params: Record<string, unknown> = {};
  let expires_at: string | null = null;
  if (a.kind === 'quiet_hours') {
    if (!a.from || !a.to) throw new Error('חסרות שעות התחלה וסיום (from/to)');
    if (a.from === a.to) throw new Error('שעת התחלה וסיום זהות');
    params = { from: a.from, to: a.to, emergencies, ...(a.days?.length ? { days: [...new Set(a.days)].sort() } : {}) };
  } else if (a.kind === 'quiet_until') {
    const prefs = await listPrefs(db).catch(() => []);
    const until = resolveUntil(a.until ?? '', now, prefs);
    if (!until) throw new Error('לא הבנתי עד מתי (until)');
    if (until.getTime() - now.getTime() > 30 * 86_400_000) throw new Error('שקט זמני מוגבל ל-30 יום. לשקט קבוע השתמש בשעות שקט או השתקת נושא');
    params = { from: nowIso, until: until.toISOString(), emergencies };
    expires_at = until.toISOString();
  } else if (a.kind === 'mute_topic') {
    if (!a.topics?.length) throw new Error('לא צוין איזה סוג הודעות להשתיק');
    params = { topics: [...new Set(a.topics)] };
  } else {
    if (!a.note && !a.label) throw new Error('ריק');
    params = { note: a.note ?? a.label };
  }
  const { data, error } = await db.from('gideon_owner_prefs').insert({ kind: a.kind, label: a.label, params, active: a.active, source, expires_at, updated_at: nowIso }).select('*').single();
  if (error || !data) throw new Error(`השמירה נכשלה: ${error?.message ?? 'no row'}`);
  return rowToPref(data);
}

/** Deactivate (Gideon) — reversible. Ops may hard-delete via deletePref. */
export async function setPrefActive(db: SupabaseClient, id: string, active: boolean): Promise<OwnerPref | null> {
  const { data, error } = await db.from('gideon_owner_prefs').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select('*');
  if (error) throw new Error(error.message);
  return data?.[0] ? rowToPref(data[0]) : null;
}

export async function deletePref(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('gideon_owner_prefs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveOpsShabbat(db: SupabaseClient, input: z.infer<typeof OpsShabbatInput>): Promise<OwnerPref> {
  const { active, ...params } = OpsShabbatInput.parse(input);
  const { data: prev } = await db.from('gideon_owner_prefs').select('id, label').eq('kind', 'shabbat').maybeSingle();
  const row = { kind: 'shabbat', label: (prev?.label as string) || 'לא לשלוח לי הודעות בשבת', params, active, source: 'ops', updated_at: new Date().toISOString() };
  const r = prev ? await db.from('gideon_owner_prefs').update(row).eq('id', prev.id).select('*').single() : await db.from('gideon_owner_prefs').insert(row).select('*').single();
  if (r.error || !r.data) throw new Error(r.error?.message ?? 'save failed');
  return rowToPref(r.data);
}
