import type { SupabaseClient } from '@supabase/supabase-js';
import { titleTokens } from '@/lib/module-api/journey/lib-tasks-title-normalize';

/**
 * App-side port of the SQL task_dup_candidates() / merge_task_assignments() (000115/000118, dropped in 000212):
 * titles, ladders, reasons, history and metadata are enc:v2 ciphertext now, so the DB cannot compare or copy them.
 * The pure builder mirrors the SQL output byte-for-byte (same pair rules, same JSON shape, same truncation).
 * The slim SQL merge_task_assignment_state() only moves ids / levels / statuses; every text write goes through the
 * field-encryption wrapper here.
 */

type Json = Record<string, unknown>;
export type DupDef = {
  title: string | null; source: string | null; created_by: string | null; habit_key: string | null; step_id: string | null;
  ladder: unknown; floor_level: number | null; max_level: number | null; schedule: string | null;
};
export type DupAssignment = {
  id: string; user_id: string; current_level: number; is_main: boolean; accepted_at: string | null; legacy_ref: string | null;
  definition: DupDef | null;
};
export type DupAlmog = {
  id: string; reason: string | null; source_excerpt: string | null; related_habit_id: string | null; related_step_id: string | null;
  relation: string | null; metadata: unknown;
};
export type DupEvent = {
  assignment_id: string; kind: string; from_level: number | null; to_level: number | null; reason: string | null;
  source: string | null; date_key: string | null; occurred_at: string;
};

const left = (s: string | null | undefined, n: number) => (s == null ? null : [...s].slice(0, n).join(''));
const jerusalemDay = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : null;

/** jsonb_strip_nulls (recursive over objects, arrays kept). */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    const o: Json = {};
    for (const [k, x] of Object.entries(v as Json)) if (x !== null && x !== undefined) o[k] = stripNulls(x);
    return o;
  }
  return v;
}

/** Pure: same pairs and JSON as the SQL function. Returns one entry per flagged user. */
export function buildDupCandidates(
  assignments: DupAssignment[],
  almog: Map<string, DupAlmog>,
  events: DupEvent[],
  limit = 200,
): { user_id: string; tasks: Json[] }[] {
  const doneN = new Map<string, number>();
  const hist = new Map<string, DupEvent[]>();
  for (const e of events) {
    if (e.kind === 'done' || e.kind === 'partial') doneN.set(e.assignment_id, (doneN.get(e.assignment_id) ?? 0) + 1);
    if (['level_change', 'merged', 'accepted'].includes(e.kind) && !(e.reason ?? '').startsWith('e2e'))
      (hist.get(e.assignment_id) ?? hist.set(e.assignment_id, []).get(e.assignment_id)!).push(e);
  }
  const rows = assignments.filter((a) => a.definition).map((a) => {
    const d = a.definition!;
    const aa = a.legacy_ref ? almog.get(a.legacy_ref) : undefined;
    const meta = aa?.metadata && typeof aa.metadata === 'object' && !Array.isArray(aa.metadata) ? (aa.metadata as Json) : null;
    const rht = meta?.related_habit_title;
    return {
      a, d, aa,
      tok: new Set(titleTokens(d.title).filter((x) => [...x].length >= 3)),
      related_habit_title: rht == null ? null : typeof rht === 'string' ? rht : JSON.stringify(rht),
      step: d.step_id ?? aa?.related_step_id ?? null,
    };
  });
  type R = (typeof rows)[number];
  const pair = (x: R, y: R) =>
    [...x.tok].some((t) => y.tok.has(t)) ||
    (x.d.habit_key != null && x.d.habit_key === y.d.habit_key && !x.d.habit_key.startsWith('almog:') && !x.d.habit_key.startsWith('ai_daily:')) ||
    (x.aa?.related_habit_id != null && (x.aa.related_habit_id === y.aa?.related_habit_id || x.aa.related_habit_id === y.d.habit_key)) ||
    (y.aa?.related_habit_id != null && y.aa.related_habit_id === x.d.habit_key) ||
    (x.step != null && x.step === y.step);
  const byUser = new Map<string, R[]>();
  for (const r of rows) (byUser.get(r.a.user_id) ?? byUser.set(r.a.user_id, []).get(r.a.user_id)!).push(r);
  const out: { user_id: string; tasks: Json[] }[] = [];
  for (const [user_id, list] of byUser) {
    const flagged = new Set<string>();
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const [x, y] = list[i].a.id < list[j].a.id ? [list[i], list[j]] : [list[j], list[i]];
        if (pair(x, y)) { flagged.add(x.a.id); flagged.add(y.a.id); }
      }
    if (!flagged.size) continue;
    const tasks = list.filter((r) => flagged.has(r.a.id))
      .sort((p, q) => Number(q.a.is_main) - Number(p.a.is_main) || (doneN.get(q.a.id) ?? 0) - (doneN.get(p.a.id) ?? 0))
      .map((r) => {
        const ladder = Array.isArray(r.d.ladder) && r.d.ladder.length
          ? (r.d.ladder as Json[]).map((l) => ({ level: l?.level ?? null, title: l?.title ?? null })) : null;
        const h = (hist.get(r.a.id) ?? []).sort((p, q) => q.occurred_at.localeCompare(p.occurred_at)).slice(0, 6)
          .map((e) => ({ kind: e.kind, from: e.from_level, to: e.to_level, reason: left(e.reason, 80), via: e.source, date: e.date_key }));
        return stripNulls({
          id: r.a.id, title: r.d.title, level: r.a.current_level, main: r.a.is_main, source: r.d.source,
          created_by: r.d.created_by, since: jerusalemDay(r.a.accepted_at), done: doneN.get(r.a.id) ?? 0,
          habit: r.d.habit_key, schedule: r.d.schedule, why: left(r.aa?.reason, 120), chat_excerpt: left(r.aa?.source_excerpt, 160),
          related_habit: r.related_habit_title, relation: r.aa?.relation === 'standalone' ? null : r.aa?.relation ?? null,
          ladder, history: h.length ? h : null,
        }) as Json;
      });
    out.push({ user_id, tasks });
    if (out.length >= limit) break;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Loads through the (decrypting) wrapped admin client and builds the candidates. */
export async function loadDupCandidates(db: SupabaseClient, limit = 200): Promise<{ user_id: string; tasks: Json[] }[]> {
  const assignments: DupAssignment[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('user_task_assignments')
      .select('id, user_id, current_level, is_main, accepted_at, legacy_ref, definition:task_definitions(title, source, created_by, habit_key, step_id, ladder, floor_level, max_level, schedule)')
      .eq('status', 'accepted').order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    assignments.push(...((data ?? []) as unknown as DupAssignment[]));
    if ((data ?? []).length < 1000) break;
  }
  const refs = [...new Set(assignments.map((a) => a.legacy_ref).filter((r): r is string => !!r && UUID.test(r)))];
  const almog = new Map<string, DupAlmog>();
  for (const ids of chunks(refs, 200)) {
    const { data, error } = await db.from('almog_assignments')
      .select('id, reason, source_excerpt, related_habit_id, related_step_id, relation, metadata').in('id', ids);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as DupAlmog[]) almog.set(String(r.id), r);
  }
  // events only for users that can have a pair (≥2 accepted tasks)
  const perUser = new Map<string, number>();
  for (const a of assignments) perUser.set(a.user_id, (perUser.get(a.user_id) ?? 0) + 1);
  const ids = assignments.filter((a) => (perUser.get(a.user_id) ?? 0) >= 2).map((a) => a.id);
  const events: DupEvent[] = [];
  for (const part of chunks(ids, 100)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('task_events')
        .select('assignment_id, kind, from_level, to_level, reason, source, date_key, occurred_at')
        .in('assignment_id', part).in('kind', ['done', 'partial', 'level_change', 'merged', 'accepted'])
        .order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      events.push(...((data ?? []) as DupEvent[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  return buildDupCandidates(assignments.filter((a) => (perUser.get(a.user_id) ?? 0) >= 2), almog, events, limit);
}

/** Level rule of merge_task_assignments: clamp to [floor, max]; an explicit ladder must contain it, else keep. */
export function mergeLevel(keep: { current_level: number; floor_level: number | null; max_level: number | null; ladder: unknown }, dropLevels: number[], requested: number | null | undefined): number {
  if (requested == null) return Math.max(keep.current_level, ...dropLevels);
  let lvl = requested;
  if (keep.floor_level != null) lvl = Math.max(lvl, keep.floor_level);
  if (keep.max_level != null) lvl = Math.min(lvl, keep.max_level);
  if (Array.isArray(keep.ladder) && keep.ladder.length && !(keep.ladder as Json[]).some((l) => Number(l?.level) === lvl)) return keep.current_level;
  return lvl;
}

const today = () => jerusalemDay(new Date().toISOString())!;

/** App-side merge_task_assignments: SQL moves state, the app writes the (sealed) events and history note. */
export async function mergeTaskAssignments(
  db: SupabaseClient,
  p: { user: string; keep: string; drop: string[]; reason?: string | null; level?: number | null },
): Promise<number> {
  const cols = 'id, current_level, is_main, definition_id, definition:task_definitions(title, floor_level, max_level, ladder)';
  const { data: k } = await db.from('user_task_assignments').select(cols).eq('id', p.keep).eq('user_id', p.user).eq('status', 'accepted').maybeSingle();
  if (!k) throw new Error('keep task not found');
  const drop = p.drop.filter((x) => x !== p.keep);
  const { data: ds } = drop.length
    ? await db.from('user_task_assignments').select(cols).in('id', drop).eq('user_id', p.user).eq('status', 'accepted')
    : { data: [] };
  if (!ds?.length || ds.length !== drop.length) throw new Error('drop tasks invalid');
  type Row = { id: string; current_level: number; definition_id: string; definition: { title: string | null; floor_level: number | null; max_level: number | null; ladder: unknown } | null };
  const keep = k as unknown as Row;
  const drops = ds as unknown as Row[];
  const def = keep.definition ?? { title: null, floor_level: null, max_level: null, ladder: null };
  const level = mergeLevel({ current_level: keep.current_level, ...def }, drops.map((d) => d.current_level), p.level);
  const { data: st, error } = await db.rpc('merge_task_assignment_state', { p_user: p.user, p_keep: p.keep, p_drop: drop, p_level: level });
  if (error) throw new Error(error.message);
  const s = (st ?? {}) as { n?: number; from_level?: number; to_level?: number; dropped_almog?: string[] };
  const from = Number(s.from_level ?? keep.current_level);
  const to = Number(s.to_level ?? level);
  const base = { user_id: p.user, assignment_id: p.keep, definition_id: keep.definition_id, date_key: today(), level: to, from_level: from, to_level: to, source: 'almog_auto' };
  if (to !== from) await db.from('task_events').insert({ ...base, kind: 'level_change', reason: p.reason ?? 'איחוד משימות' });
  await db.from('task_events').insert({
    ...base, kind: 'merged', reason: p.reason ?? 'איחוד משימות על אותו הרגל',
    metadata: { merged_ids: drop, merged_titles: drops.map((d) => d.definition?.title ?? null), kept_title: def.title, requested_level: p.level ?? null, from_level: from, to_level: to },
  });
  for (const id of s.dropped_almog ?? []) {
    const { data: a } = await db.from('almog_assignments').select('id, user_id, history').eq('id', id).maybeSingle();
    const h = Array.isArray(a?.history) ? (a!.history as unknown[]) : [];
    await db.from('almog_assignments').update({ history: [...h, { at: new Date().toISOString(), action: 'dropped', note: `אוחד לתוך המשימה "${def.title ?? ''}"` }] }).eq('id', id).eq('user_id', p.user);
  }
  return Number(s.n ?? drops.length);
}
