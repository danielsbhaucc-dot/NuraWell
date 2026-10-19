import { decInteractionResult } from '@/lib/crypto/pii-fields';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildBusinessMetrics } from '@/lib/admin/business-metrics';
import { deleteUserCompletely } from '@/lib/admin/delete-user-completely';
import { opsLink } from './channel';
import { openOwnerTasks, setOwnerTask } from './owner-tasks';
import { autoForward, forwardSchema, orWorkStatus, type ForwardArgs } from './dev-forward';
import { describePref, listPrefs, PrefInput, savePref, setPrefActive } from './prefs';
import { createDemoAccessLink, resolveCeoActorUserId, readDemoDefaultTarget } from '@/lib/demo-access/create';

/**
 * CEO tool registry. Read tools run immediately; write tools are NEVER executed by the model —
 * they only create a pending action that Daniel approves with an inline button (see actions.ts).
 * Add a capability = add one entry here.
 */
type Db = SupabaseClient;
export type CeoTool = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  write: boolean;
  /** irreversible: approval card carries an explicit warning */
  destructive?: boolean;
  /** read: returns data for the model. write: executes after approval. */
  run: (db: Db, args: Record<string, unknown>) => Promise<unknown>;
  /** result contains a secret (e.g. a demo URL): show once in Telegram, never persist it */
  secretResult?: boolean;
  /** write tools: one-line Hebrew description shown on the approval card */
  summarize?: (args: Record<string, unknown>) => string;
};

const uuid = z.string().uuid();
const clip = (s: unknown, n = 280) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n)}…` : s) : s);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function rows<T = Record<string, unknown>>(p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const CEO_TOOLS: CeoTool[] = [
  {
    name: 'metrics',
    description: 'Core KPIs for the last N days vs the previous N days (users, activity, tasks, level changes, SOS, notifications, errors, subscriptions, content gaps). Computed in SQL.',
    schema: z.object({ days: z.number().int().min(1).max(90).default(1) }),
    write: false,
    run: async (db, a) => {
      const { data, error } = await db.rpc('ceo_metrics', { p_days: a.days ?? 1 });
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: 'business_metrics',
    description: 'Business dashboard: MRR/ARR, subscribers by tier, trials, churn, AI cost per user.',
    schema: z.object({ days: z.number().int().min(1).max(365).default(30) }),
    write: false,
    run: (db, a) => buildBusinessMetrics(db, Number(a.days ?? 30)),
  },
  {
    name: 'list_users',
    description: 'List real users. filter: inactive (no activity 7d+), not_onboarded, new (7d), all. name: optional — find users by name (matched server-side). Only first names are returned, never full names.',
    schema: z.object({ filter: z.enum(['inactive', 'not_onboarded', 'new', 'all']).default('all'), name: z.string().trim().min(1).max(60).optional(), limit: z.number().int().min(1).max(50).default(20) }),
    write: false,
    run: async (db, a) => {
      let q = db.from('profiles').select('id, full_name, gender, created_at, last_active_at, onboarding_completed, engagement_status, program_state, streak_days, notify_test_opt_in, is_active').eq('role', 'user');
      if (a.filter === 'inactive') q = q.lt('last_active_at', daysAgo(7));
      if (a.filter === 'not_onboarded') q = q.eq('onboarding_completed', false);
      if (a.filter === 'new') q = q.gte('created_at', daysAgo(7));
      if (a.name) q = q.ilike('full_name', `%${String(a.name).replace(/[%_,()\\]/g, '')}%`);
      const r = await rows(q.order('last_active_at', { ascending: true, nullsFirst: true }).limit(Number(a.limit ?? 20)));
      return r.map((u) => ({ ...firstNameOnly(u as Record<string, unknown>), link: opsLink(`/users?user=${u.id}`) }));
    },
  },
  {
    name: 'user_detail',
    description: 'One user: profile, active tasks with levels, last 10 task events, recent SOS, last notifications.',
    schema: z.object({ userId: uuid }),
    write: false,
    run: async (db, a) => {
      const id = String(a.userId);
      const [p, tasks, ev, sos, notes] = await Promise.all([
        db.from('profiles').select('id, full_name, gender, role, main_goal, main_obstacle, created_at, last_active_at, onboarding_completed, engagement_status, program_state, streak_days, notify_paused_until, is_active').eq('id', id).maybeSingle(),
        rows(db.from('user_task_assignments').select('status, is_main, current_level, original_level, task_definitions(title, habit_key, floor_level, max_level)').eq('user_id', id).eq('status', 'active').limit(20)),
        rows(db.from('task_events').select('kind, date_key, level, from_level, to_level, reason, occurred_at').eq('user_id', id).order('occurred_at', { ascending: false }).limit(10)),
        rows(db.from('guardian_sos_events').select('trigger, outcome, red_flag, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(5)),
        rows(db.from('notifications').select('type, title, body, is_read, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(5)),
      ]);
      return { profile: p.data ? firstNameOnly(p.data as Record<string, unknown>) : null, activeTasks: tasks, recentEvents: ev, sos, notifications: notes.map((n) => ({ ...n, body: clip(n.body, 160) })), link: opsLink(`/users?user=${id}`) };
    },
  },
  {
    name: 'almog_quality_sample',
    description: "Sample of Almog's recent outgoing texts (chat replies + notifications) for quality review: Hebrew quality, safety, masculine self-reference, matching user gender, habit-change (not weight-loss) framing.",
    schema: z.object({ days: z.number().int().min(1).max(30).default(1), limit: z.number().int().min(1).max(30).default(12) }),
    write: false,
    run: async (db, a) => {
      const since = daysAgo(Number(a.days ?? 1));
      const n = Number(a.limit ?? 12);
      const [chat, notes] = await Promise.all([
        rows(db.from('ai_interactions').select('user_id, content, created_at, profiles!inner(gender, role)').eq('role', 'assistant').eq('profiles.role', 'user').gte('created_at', since).order('created_at', { ascending: false }).limit(n).then(decInteractionResult())),
        rows(db.from('notifications').select('user_id, type, title, body, created_at, profiles!inner(gender, role)').eq('profiles.role', 'user').gte('created_at', since).order('created_at', { ascending: false }).limit(n)),
      ]);
      const g = (r: Record<string, unknown>) => (r.profiles as { gender?: string } | null)?.gender ?? null;
      return {
        chat: chat.map((r) => ({ userGender: g(r), text: clip(r.content, 400), at: r.created_at })),
        notifications: notes.map((r) => ({ userGender: g(r), type: r.type, title: r.title, body: clip(r.body, 240), at: r.created_at })),
      };
    },
  },
  {
    name: 'errors',
    description: 'Server errors grouped by source+message for the last N days.',
    schema: z.object({ days: z.number().int().min(1).max(30).default(1) }),
    write: false,
    run: async (db, a) => {
      const r = await rows<{ source: string | null; route: string | null; message: string; severity: string }>(db.from('error_events').select('source, route, message, severity').gte('created_at', daysAgo(Number(a.days ?? 1))).in('severity', ['error', 'fatal']).limit(500));
      const m = new Map<string, number>();
      for (const e of r) {
        const k = `${e.source ?? e.route ?? '?'} | ${e.message.slice(0, 120)}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return { total: r.length, top: [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, n]) => ({ k, n })), link: opsLink('/errors') };
    },
  },
  {
    name: 'content_overview',
    description: 'Stations and their steps (lessons): published flag, has video, task count. Use to find content gaps.',
    schema: z.object({}),
    write: false,
    run: async (db) => {
      const [st, steps] = await Promise.all([
        rows<{ id: string; title: string; sort_order: number; habit_key: string | null }>(db.from('journey_stations').select('id, title, sort_order, habit_key').order('sort_order')),
        rows<{ id: string; station_id: string | null; title: string; is_published: boolean; video_external_id: string | null; video_external_url: string | null; tasks: unknown }>(db.from('journey_steps').select('id, station_id, title, is_published, video_external_id, video_external_url, tasks').order('step_number')),
      ]);
      return st.map((s) => ({
        stationId: s.id,
        station: s.title,
        habit: s.habit_key,
        steps: steps.filter((x) => x.station_id === s.id).map((x) => ({ id: x.id, title: x.title, published: x.is_published, video: Boolean(x.video_external_id || x.video_external_url), tasks: Array.isArray(x.tasks) ? x.tasks.length : 0, link: opsLink(`/steps/${x.id}`) })),
      }));
    },
  },
  {
    name: 'list_pending_actions',
    description: 'Pending (unapproved) CEO actions.',
    schema: z.object({}),
    write: false,
    run: (db) => rows(db.from('ceo_pending_actions').select('id, tool, summary, created_at, expires_at').eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20)),
  },
  // ---------------- write tools (approval required) ----------------
  {
    name: 'set_test_user',
    description: 'Mark/unmark a user as a notification test user (profiles.notify_test_opt_in).',
    schema: z.object({ userId: uuid, enabled: z.boolean() }),
    write: true,
    summarize: (a) => `${a.enabled ? 'סימון' : 'ביטול הסימון של'} ${a.userId} כמשתמש בדיקה`,
    run: async (db, a) => {
      const { error } = await db.from('profiles').update({ notify_test_opt_in: a.enabled }).eq('id', String(a.userId));
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  },
  {
    name: 'pause_user_notifications',
    description: 'Pause automatic notifications for a user for N days (0 = resume).',
    schema: z.object({ userId: uuid, days: z.number().int().min(0).max(60) }),
    write: true,
    summarize: (a) => (Number(a.days) ? `השהיית ההתראות של ${a.userId} ל-${a.days} ימים` : `חידוש ההתראות של ${a.userId}`),
    run: async (db, a) => {
      const until = Number(a.days) ? new Date(Date.now() + Number(a.days) * 86_400_000).toISOString() : null;
      const { error } = await db.from('profiles').update({ notify_paused_until: until }).eq('id', String(a.userId));
      if (error) throw new Error(error.message);
      return { ok: true, until };
    },
  },
  {
    name: 'set_step_published',
    description: 'Publish or unpublish a journey step (lesson).',
    schema: z.object({ stepId: uuid, published: z.boolean() }),
    write: true,
    summarize: (a) => `${a.published ? 'פרסום' : 'הסתרת'} שיעור ${a.stepId}`,
    run: async (db, a) => {
      const { error } = await db.from('journey_steps').update({ is_published: a.published }).eq('id', String(a.stepId));
      if (error) throw new Error(error.message);
      return { ok: true, link: opsLink(`/steps/${a.stepId}`) };
    },
  },
  {
    name: 'create_draft_step',
    description: 'Create an UNPUBLISHED lesson draft in a station. Call draft_lesson_content first and pass its output here.',
    schema: z.object({
      stationId: uuid,
      title: z.string().min(2).max(120),
      description: z.string().max(400).default(''),
      text_content: z.string().max(12000),
      summary_text: z.string().max(1200).default(''),
      tasks: z.array(z.object({ title: z.string(), description: z.string().optional() })).max(6).default([]),
    }),
    write: true,
    summarize: (a) => `יצירת טיוטת שיעור "${a.title}" (לא מפורסם)`,
    run: async (db, a) => {
      const { data: sib } = await db.from('journey_steps').select('course_id, step_number').order('step_number', { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from('journey_steps').insert({
        station_id: a.stationId,
        course_id: sib?.course_id ?? null,
        step_number: Number(sib?.step_number ?? 0) + 1,
        title: a.title,
        description: a.description,
        text_content: a.text_content,
        summary_text: a.summary_text,
        tasks: a.tasks,
        is_published: false,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { ok: true, stepId: data.id, link: opsLink(`/steps/${data.id}`) };
    },
  },
];


// ---------------- generic admin data access (allowlisted) ----------------
/** Everything the panel manages. Writes only on these; reads on these + analytics tables. */
export const WRITE_TABLES = [
  'journey_stations', 'journey_steps', 'task_definitions', 'user_task_assignments', 'almog_assignments', 'almog_focus_periods',
  'notifications', 'scheduled_reminders', 'almog_knowledge', 'site_settings', 'courses', 'lessons', 'enrollments',
  'challenge_campaigns', 'challenge_task_definitions', 'challenge_enrollments', 'audio_playlists', 'audio_tracks',
  'media_assets', 'user_memories', 'subscriptions', 'profiles',
] as const;
export const READ_TABLES = [
  ...WRITE_TABLES, 'task_events', 'ai_interactions', 'chat_sessions', 'guardian_sos_events', 'error_events', 'billing_events',
  'journey_progress', 'journey_task_executions', 'safety_events', 'almog_interventions', 'almog_blockers', 'almog_kickoff_status',
  'ops_admin_notifications', 'lesson_progress', 'demo_access_links', 'challenge_task_completions', 'challenge_success_events', 'user_insights',
  'notification_fall_episodes', 'ceo_audit_log', 'ceo_pending_actions', 'ceo_owner_tasks',
] as const;
/** profiles: never allow role / consent / auth-adjacent columns to be changed by the agent. */
const PROFILE_WRITABLE = new Set(['full_name', 'gender', 'is_active', 'notify_test_opt_in', 'notify_paused_until', 'notification_prefs', 'program_state', 'engagement_status', 'main_goal', 'main_obstacle', 'wake_up_time', 'sleep_time', 'dinner_time', 'meal_count', 'meal_schedule', 'ai_check_in_times', 'daily_task', 'weakest_time_of_day', 'preferred_channel', 'ai_system_prompt']);
const ident = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const filt = z.array(z.object({ col: ident, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'is', 'in']), value: z.unknown() })).max(8).default([]);
const match = z.record(ident, z.union([z.string(), z.number(), z.boolean()])).refine((m) => Object.keys(m).length > 0, 'match must not be empty');

/** Tables holding tokens/secrets: never via generic writes — they have dedicated server flows (e.g. create_demo_link). */
export const SECRET_TABLES = new Set(['demo_access_links', 'demo_access_sessions', 'gideon_settings']);
const SECRET_COL = /(hash|token|secret|password|api_key)/i;
/** תוכן שיחה / בריאות / פרטי קשר: לא נשלח לספק ה-AI של גדעון (PII מינימלי). */
const PRIVATE_COL = /^(content|note|memory_text|insight_text|source_excerpt|raw_chat_text|user_message|assistant_message|rolling_summary|live_conversation_file|phone|email|avatar_url|health_conditions|dietary_preferences|main_obstacle_detail|current_weight_kg|goal_weight_kg|height_cm|weight_kg|bmi|ai_context|transcript|extracted_insights)$/i;
/** הספק של ה-AI רואה שם פרטי בלבד — השם המלא נשאר בשרת. */
export function firstNameOnly<T extends Record<string, unknown>>(row: T): Omit<T, 'full_name'> & { first_name?: string | null } {
  if (!('full_name' in row)) return row;
  const { full_name, ...rest } = row;
  const first = typeof full_name === 'string' ? full_name.trim().split(/\s+/)[0] || null : null;
  return { ...rest, first_name: first };
}
function redactCell(k: string, v: unknown): unknown {
  if (PRIVATE_COL.test(k)) return v === null || v === undefined || v === '' ? v : '[פרטי]';
  if (typeof v === 'string' && v.startsWith('enc:v1:')) return '[מוצפן]';
  return typeof v === 'string' ? clip(v, 600) : v;
}

function guardWrite(table: string, row?: Record<string, unknown>) {
  if (SECRET_TABLES.has(table)) throw new Error(`table ${table} is managed by a dedicated tool (create_demo_link), not generic writes`);
  if (!(WRITE_TABLES as readonly string[]).includes(table)) throw new Error(`table not writable: ${table}`);
  if (row) for (const k of Object.keys(row)) if (SECRET_COL.test(k)) throw new Error(`column ${k} cannot be set by generic writes`);
  if (table === 'profiles' && row) for (const k of Object.keys(row)) if (!PROFILE_WRITABLE.has(k)) throw new Error(`profiles.${k} is not writable`);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: { col: string; op: string; value: unknown }[]) {
  for (const x of f) q = q[x.op](x.col, x.value);
  return q;
}
const TABLE_LABEL: Record<string, string> = {
  journey_stations: 'תחנה', journey_steps: 'שיעור', task_definitions: 'משימה', user_task_assignments: 'משימה של משתמש',
  almog_assignments: 'משימה לאלמוג', almog_focus_periods: 'תקופת מיקוד', notifications: 'התראה', scheduled_reminders: 'תזכורת',
  almog_knowledge: 'ידע לאלמוג', site_settings: 'הגדרת אתר', courses: 'קורס', lessons: 'שיעור', enrollments: 'הרשמה לקורס',
  challenge_campaigns: 'אתגר', challenge_task_definitions: 'משימת אתגר', challenge_enrollments: 'הרשמה לאתגר',
  audio_playlists: 'פלייליסט', audio_tracks: 'רצועת אודיו', media_assets: 'קובץ מדיה', user_memories: 'זיכרון של משתמש',
  subscriptions: 'מנוי', profiles: 'פרופיל משתמש',
};
const tableLabel = (t: unknown) => TABLE_LABEL[String(t)] ?? 'רשומה';
const nameOf = (r: unknown) => {
  const o = (r ?? {}) as Record<string, unknown>;
  const n = o.title ?? o.name ?? o.full_name ?? o.key;
  return typeof n === 'string' && n.trim() ? ` "${clip(n.trim(), 50)}"` : '';
};
const FIELD_LABEL: Record<string, string> = {
  title: 'כותרת', description: 'תיאור', body: 'תוכן', text_content: 'תוכן', is_published: 'פרסום', is_active: 'פעיל',
  full_name: 'שם', gender: 'מגדר', notify_paused_until: 'השהיית התראות', notify_test_opt_in: 'משתמש בדיקה', current_level: 'רמה',
  status: 'סטטוס', sort_order: 'סדר', value: 'ערך', tasks: 'משימות', summary_text: 'סיכום',
};
function describePatch(p: unknown): string {
  const o = (p ?? {}) as Record<string, unknown>;
  const parts = Object.entries(o).filter(([k]) => k !== 'title' || Object.keys(o).length === 1).map(([k, v]) => {
    const label = FIELD_LABEL[k] ?? 'שדה נוסף';
    if (typeof v === 'boolean') return `${label}: ${v ? 'כן' : 'לא'}`;
    if (typeof v === 'number' || (typeof v === 'string' && v.length <= 40)) return `${label} ← ${v}`;
    return `${label} (עודכן)`;
  });
  return [...new Set(parts)].slice(0, 4).join(', ') || 'שינוי שדות';
}

const GENERIC: CeoTool[] = [
  {
    name: 'create_demo_link',
    secretResult: true,
    description:
      'יצירת קישור דמו (גישת אורח זמנית) — "תן לאלכס גישה", "תפתח דמו לדנה". Create a demo access link for a guest (the ONLY way to create demo links — never db_insert into demo_access_links). The server generates the token, stores only its hash and returns the real URL after approval. Target = the default demo account set in the Ops dashboard; pass targetUserId only if Daniel names a specific account (find it with list_users / db_read profiles).',
    schema: z.object({
      guest_name: z.string().trim().min(1).max(80).optional(),
      hours: z.number().int().min(1).max(168).default(24),
      reason: z.string().trim().min(2).max(280).default('קישור דמו מגדעון'),
      targetUserId: uuid.optional(),
      max_claims: z.number().int().min(1).max(500).optional(),
    }),
    write: true,
    summarize: (a) => `יצירת קישור דמו${a.guest_name ? ` ל${a.guest_name}` : ''}, בתוקף ${a.hours === 24 ? 'ליממה' : `ל-${a.hours} שעות`}${a.max_claims ? `, עד ${a.max_claims} כניסות` : ''}${a.targetUserId ? `, לחשבון של ${a.targetUserId}` : ''}`,
    run: async (db, a) => {
      const target = (a.targetUserId as string | undefined) ?? (await readDemoDefaultTarget(db));
      if (!target) throw new Error('לא הוגדר משתמש דמו ברירת מחדל בדשבורד (Ops ← גישת דמו)');
      const r = await createDemoAccessLink(db, {
        target_user_id: target,
        reason: String(a.reason),
        guest_name: (a.guest_name as string | undefined) ?? null,
        ttl_minutes: Number(a.hours ?? 24) * 60,
        max_claims: (a.max_claims as number | undefined) ?? null,
        created_by: await resolveCeoActorUserId(db),
      });
      if (!r.ok) throw new Error(r.error);
      return { ok: true, id: r.id, link: r.demo_url, expires_at: r.expires_at, guest_name: r.guest_name };
    },
  },
  {
    name: 'db_read',
    description: `Read any admin table (select columns, filters, order, limit≤100). Tables: ${READ_TABLES.join(', ')}. Use for anything not covered by a specific tool.`,
    schema: z.object({ table: z.enum(READ_TABLES), columns: z.string().max(400).default('*'), filters: filt, order: ident.optional(), ascending: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(20) }),
    write: false,
    run: async (db, a) => {
      let q = db.from(String(a.table)).select(String(a.columns ?? '*'));
      q = applyFilters(q, (a.filters as never) ?? []);
      if (a.order) q = q.order(String(a.order), { ascending: Boolean(a.ascending) });
      const r = await rows(q.limit(Number(a.limit ?? 20)) as never);
      return r.map((x) => Object.fromEntries(Object.entries(firstNameOnly(x as Record<string, unknown>)).filter(([k]) => !SECRET_COL.test(k)).map(([k, v]) => [k, redactCell(k, v)])));
    },
  },
  {
    name: 'db_insert',
    description: `Insert a row (content, tasks/ladders, stations, notifications, settings, etc.). Writable: ${WRITE_TABLES.join(', ')}.`,
    schema: z.object({ table: z.enum(WRITE_TABLES), row: z.record(ident, z.unknown()) }),
    write: true,
    summarize: (a) => `הוספת ${tableLabel(a.table)}${nameOf(a.row)}`,
    run: async (db, a) => {
      guardWrite(String(a.table), a.row as never);
      const { data, error } = await db.from(String(a.table)).insert(a.row as never).select('*').single();
      if (error) throw new Error(error.message);
      return { ok: true, row: data };
    },
  },
  {
    name: 'db_update',
    description: 'Update rows matching an exact match object (e.g. {"id": "..."}). Use for editing lessons, ladders, levels, settings, user fields.',
    schema: z.object({ table: z.enum(WRITE_TABLES), match, patch: z.record(ident, z.unknown()) }),
    write: true,
    summarize: (a) => `עדכון ${tableLabel(a.table)}${nameOf(a.patch)}: ${describePatch(a.patch)}`,
    run: async (db, a) => {
      guardWrite(String(a.table), a.patch as never);
      const { data, error } = await db.from(String(a.table)).update(a.patch as never).match(a.match as never).select('*');
      if (error) throw new Error(error.message);
      return { ok: true, updated: data?.length ?? 0 };
    },
  },
  {
    name: 'db_delete',
    description: 'DESTRUCTIVE: delete rows matching an exact match object. Prefer unpublish/deactivate when possible.',
    schema: z.object({ table: z.enum(WRITE_TABLES), match }),
    write: true,
    destructive: true,
    summarize: (a) => `מחיקת ${tableLabel(a.table)}${nameOf(a.match)}`,
    run: async (db, a) => {
      guardWrite(String(a.table));
      if (a.table === 'profiles') throw new Error('use delete_user');
      const { data, error } = await db.from(String(a.table)).delete().match(a.match as never).select('*');
      if (error) throw new Error(error.message);
      return { ok: true, deleted: data?.length ?? 0 };
    },
  },
  {
    name: 'send_user_notification',
    description: "Send an in-app notification to a user in Almog's voice (masculine, user's gender). Respect the fade rule; use rarely.",
    schema: z.object({ userId: uuid, title: z.string().min(2).max(80), body: z.string().min(2).max(400), action_url: z.string().max(200).default('/dashboard') }),
    write: true,
    summarize: (a) => `שליחת התראה ל${a.userId}: "${a.title}"`,
    run: async (db, a) => {
      const day = new Date().toISOString().slice(0, 10);
      const { error } = await db.from('notifications').insert({ user_id: a.userId, type: 'admin_message', title: a.title, body: a.body, action_url: a.action_url, icon_emoji: '💬', dedupe_key: `ceo:${a.userId}:${day}:${String(a.title).slice(0, 40)}`, metadata: { source: 'ceo' } });
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  },
  {
    name: 'delete_user',
    description: 'DESTRUCTIVE: permanently delete a user account and all their data.',
    schema: z.object({ userId: uuid }),
    write: true,
    destructive: true,
    summarize: (a) => `מחיקה מלאה של החשבון של ${a.userId} וכל הנתונים שלו`,
    run: async (db, a) => {
      const r = await deleteUserCompletely(db, String(a.userId));
      if (!r.ok) throw new Error(r.error);
      return { ok: true };
    },
  },
];

const OWNER: CeoTool[] = [
  {
    name: 'owner_tasks_list',
    description: "Daniel's open human-only tasks (tracker).",
    schema: z.object({}),
    write: false,
    run: (db) => openOwnerTasks(db),
  },
  {
    name: 'owner_task_create',
    description:
      'Open a task for Daniel ONLY if it truly requires a human: filming a HeyGen video, a legal/accounting/billing decision, an account/provider action (signup, payment, DNS, keys). NEVER for anything you can do yourself or propose as an approval. Default: do not create tasks.',
    schema: z.object({
      title: z.string().min(3).max(120),
      detail: z.string().max(600).default(''),
      priority: z.enum(['high', 'normal', 'low']).default('normal'),
      origin: z.enum(['content', 'legal', 'billing', 'account', 'ops', 'daniel']),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    write: false,
    run: async (db, a) => {
      const { data, error } = await db.from('ceo_owner_tasks').insert(a).select('id, title').single();
      if (error) {
        if (error.message.includes('duplicate') || (error as { code?: string }).code === '23505') return { ok: true, note: 'already open' };
        throw new Error(error.message);
      }
      return { ok: true, task: data };
    },
  },
  {
    name: 'owner_task_update',
    description: 'Update a Daniel task when he says so: done, canceled, reopen, snooze N days, priority, due date.',
    schema: z.object({
      id: uuid,
      status: z.enum(['done', 'canceled', 'open']).optional(),
      snoozeDays: z.number().int().min(1).max(60).optional(),
      priority: z.enum(['high', 'normal', 'low']).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }),
    write: false,
    run: async (db, a) => ({ ok: true, task: await setOwnerTask(db, String(a.id), a as never) }),
  },
];

const JOURNEY: CeoTool[] = [
  {
    name: 'journey_agent_start',
    description:
      'Start the journey-step content agent on raw material Daniel pasted (lesson transcript / research / links, ≥40 chars). Runs in the background (1-3 min); the agent reports back on Telegram with its opinion, questions, or a finished draft + editor link. Creates only a draft — nothing is published.',
    schema: z.object({ sourceText: z.string().min(40).max(60_000) }),
    write: false,
    run: async (db, a) => {
      const { createAgentSession } = await import('@/lib/admin/journey-agent/agent');
      const { runAgentInBackground } = await import('@/lib/admin/journey-agent/telegram-bridge');
      const s = await createAgentSession(db, { createdBy: 'gideon', sourceText: String(a.sourceText) });
      const kick = await runAgentInBackground(s.id);
      return { ok: kick.ok, sessionId: s.id, note: kick.ok ? 'הסוכן התחיל, יעדכן כאן בטלגרם' : `לא הצלחתי להפעיל ברקע: ${kick.reason}` };
    },
  },
  {
    name: 'journey_agent_reply',
    description:
      "Pass Daniel's answers / change requests to a journey-agent session that is waiting or done (sessionId from journey_agent_sessions_list). The agent continues in the background and reports on Telegram.",
    schema: z.object({ sessionId: uuid, reply: z.string().min(1).max(8000) }),
    write: false,
    run: async (db, a) => {
      const { applyAdminInput, loadAgentSession } = await import('@/lib/admin/journey-agent/agent');
      const { runAgentInBackground } = await import('@/lib/admin/journey-agent/telegram-bridge');
      const s = await loadAgentSession(db, String(a.sessionId));
      if (!s) return { ok: false, error: 'session not found' };
      if (s.status === 'working') return { ok: false, error: 'agent still working' };
      const answers = Object.fromEntries(s.pending_questions.map((q) => [q.id, `${q.label} → (ראה תשובת המנהל)`]));
      const next = applyAdminInput(s, { answers, comment: String(a.reply) });
      await db.from('journey_agent_sessions').update({ status: 'working', answers: next.answers, pending_questions: [], draft: next.draft, review: next.review }).eq('id', s.id);
      const kick = await runAgentInBackground(s.id);
      return { ok: kick.ok, note: kick.ok ? 'הסוכן ממשיך, יעדכן בטלגרם' : kick.reason };
    },
  },
  {
    name: 'journey_agent_sessions_list',
    description: 'Latest journey-agent sessions (id, status working/waiting/done/error, summary, open questions).',
    schema: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
    write: false,
    run: async (db, a) => {
      const { latestAgentSessions } = await import('@/lib/admin/journey-agent/telegram-bridge');
      return latestAgentSessions(db, Number(a.limit ?? 5));
    },
  },
];

const DEV: CeoTool[] = [
  {
    name: 'recent_digest_findings',
    description: 'Latest saved summaries/reviews (weekly/monthly digests) with their forward status, so you can forward a finding to Or when Daniel asks (e.g. "תעביר לאור את עניין הניסוח").',
    schema: z.object({ limit: z.number().int().min(1).max(5).default(2) }),
    write: false,
    run: async (db, a) =>
      rows(db.from('ceo_dev_forwards').select('id, created_at, status, title, or_notes, source_text').order('created_at', { ascending: false }).limit(Number(a.limit ?? 2))).then((r) =>
        r.map((x) => ({ ...x, source_text: clip(x.source_text, 3000) })),
      ),
  },
  {
    name: 'forward_to_developer',
    description:
      'Forward a technical/code/bug/security/privacy/performance/Almog-quality finding to Or (lead engineer) — AUTOMATIC, no approval needed (it only queues work). NOT for business/product/personal decisions (those go to Daniel). Title + problem in Hebrew AND English, anonymized evidence (NO names, emails, phones, ids — "משתמש A"), concrete suggested fix. Deduped against open items. Tell Daniel "העברתי לאור" only after this returns ok.',
    schema: forwardSchema,
    write: false,
    run: async (db, a) => {
      const { forwardId: _f, ...rest } = a as ForwardArgs;
      void _f;
      const r = await autoForward(db, rest, { source: 'chat' });
      return { ok: true, deduped: r.deduped };
    },
  },
  {
    name: 'send_ops_access_link',
    description: 'Send Daniel (this verified owner chat only) a button that opens the Ops access flow on the main site. The button alone grants nothing: a session + trusted device are still required. Use when Daniel asks how to get into Ops / for a link.',
    schema: z.object({}),
    write: false,
    run: async () => {
      const { publicAppBaseNoSlashSync } = await import('@/lib/public-app-url');
      const { createTelegramChannel } = await import('./telegram');
      const { allowedChatIds } = await import('./channel');
      const url = `${publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app'}/auth/bridge-to-ops`;
      const ch = createTelegramChannel();
      for (const id of allowedChatIds()) await ch.send(id, '🔐 כניסה ל-Ops (דורש סשן ומכשיר מאושר):', [[{ text: 'פתח', data: '', url }]], { kind: 'reply' }).catch(() => {});
      return { ok: true, note: 'הכפתור נשלח בצ׳אט. אל תכתוב את הכתובת בטקסט.' };
    },
  },
  {
    name: 'ops_devices_list',
    description: 'List Daniel\'s trusted Ops devices (id, name, last seen). Use when Daniel says "נתק אותי" / "תשכח את המכשיר" / "תשכח אותי": show the list and offer exactly three options: (1) ops_sign_out_everywhere, (2) ops_forget_device for one device, (3) ops_forget_all_devices. Never delete the account or any data.',
    schema: z.object({}),
    write: false,
    run: async (db) => {
      const { ownerAdminId } = await import('@/lib/ops/owner-actions');
      const { listDevices } = await import('@/lib/ops/device-trust');
      const uid = await ownerAdminId(db);
      const list = await listDevices(db, uid);
      return { devices: list.map((d) => ({ id: d.id, name: d.label, via: d.via, lastSeen: d.last_seen_at })), options: ['ops_sign_out_everywhere', 'ops_forget_device', 'ops_forget_all_devices'] };
    },
  },
  {
    name: 'ops_sign_out_everywhere',
    description: 'Log Daniel out everywhere: revokes all his sessions (main site + Ops). Trusted devices stay trusted. Only on Daniel\'s explicit request in this chat. Confirm only after the result says verified.',
    schema: z.object({}),
    write: true,
    summarize: () => 'ניתוק מכל החיבורים (אתר + Ops) בכל המכשירים. המכשירים נשארים מאושרים.',
    run: async (db) => (await import('@/lib/ops/owner-actions')).signOutEverywhere(db),
  },
  {
    name: 'ops_forget_device',
    description: 'Forget one trusted Ops device (by id from ops_devices_list). Next login from it needs new-device approval. Confirm only after verified.',
    schema: z.object({ deviceId: uuid }),
    write: true,
    summarize: (a) => `שכחת מכשיר מאושר (${String(a.deviceId).slice(0, 8)}…). כניסה הבאה ממנו תדרוש אישור מכשיר חדש.`,
    run: async (db, a) => (await import('@/lib/ops/owner-actions')).forgetDevice(db, String(a.deviceId)),
  },
  {
    name: 'ops_forget_all_devices',
    description: 'Forget ALL trusted Ops devices and sign out everywhere. Next login on any device needs new-device approval. Never deletes the account or data. Confirm only after verified.',
    schema: z.object({}),
    write: true,
    summarize: () => 'שכחת כל המכשירים המאושרים + ניתוק מכל החיבורים. כל כניסה הבאה תדרוש אישור מכשיר חדש.',
    run: async (db) => (await import('@/lib/ops/owner-actions')).forgetAllDevices(db),
  },
  {
    name: 'report_ops_lockout',
    description: 'LAST RESORT, only when Daniel himself (this chat) says he is locked out of Ops and every approval method failed. Files a sensitive lockout item for Or. Never on behalf of anyone else. Afterwards tell Daniel Or will handle it and point him to the self-service emergency guide.',
    schema: z.object({ what_failed_he: z.string().min(3).max(600) }),
    write: false,
    run: async (db, a) => {
      const r = await autoForward(db, {
        title: 'Ops lockout — Daniel cannot get in',
        problem_he: `דניאל נעול מחוץ ל-Ops. מה נוסה: ${String(a.what_failed_he)}`,
        problem_en: 'Owner reports being locked out of Ops after all approval methods failed. Verify identity out-of-band before any reset (ops_break_glass_reset).',
        evidence: '', suggested_fix: 'Out-of-band identity check, then select * from public.ops_break_glass_reset(); and help Daniel save the new recovery codes.',
      }, { kind: 'lockout', risk: 'sensitive', source: 'chat' });
      return { ok: true, deduped: r.deduped };
    },
  },
  {
    name: 'or_work_status',
    description: 'What Or (the developer) is working on: forwarded items with status new/in_progress/done/rejected and Or\'s notes. Use for "על מה אור עובד?". Never say Or fixed something unless its status is done.',
    schema: z.object({}),
    write: false,
    run: (db) => orWorkStatus(db),
  },
];


/**
 * Daniel's standing instructions ("don't message me on Shabbat", quiet hours, stop a message type).
 * Saved instantly (Daniel's own preference, no approval card) and ENFORCED in code at the send layer.
 * Gideon may confirm only after owner_pref_set returned ok (agent.ts enforces this too).
 */
export const PREF_TOOLS: CeoTool[] = [
  {
    name: 'owner_pref_set',
    description:
      'Save a STANDING instruction from Daniel about when/what you message him. MUST be called before you agree to any such request ("אל תשלח לי בשבת", "בלי הודעות היום", "לא לפני 8 בבוקר", "תפסיק לשלוח עדכון יומי"). kind: shabbat (recurring, from candle lighting to tzeit, incl. Yom Tov) | quiet_hours (from/to HH:MM Israel, optional days) | quiet_until (one-off; until = end_of_shabbat | end_of_today | tomorrow_morning | ISO) | mute_topic (topics: daily, weekly, monthly, cost, owner_tasks, agent_report, dev_forward) | note (any other standing instruction about your behavior; remembered every turn but NOT code-enforced — say so). Held messages are delivered when quiet ends. Security alerts cannot be muted here.',
    schema: PrefInput,
    write: false,
    run: async (db, a) => {
      const p = await savePref(db, a as never, 'gideon');
      return { ok: true, saved: { id: p.id, kind: p.kind, enforced_in_code: p.kind !== 'note', description: describePref(p) } };
    },
  },
  {
    name: 'owner_prefs_list',
    description: "Daniel's active standing instructions (what is enforced and how).",
    schema: z.object({}),
    write: false,
    run: async (db) => (await listPrefs(db)).map((p) => ({ id: p.id, kind: p.kind, label: p.label, description: describePref(p), source: p.source })),
  },
  {
    name: 'owner_pref_remove',
    description: 'Turn off one of Daniel\'s standing instructions when he asks (id from owner_prefs_list). Reversible (Ops can re-enable).',
    schema: z.object({ id: uuid }),
    write: false,
    run: async (db, a) => {
      const p = await setPrefActive(db, String(a.id), false);
      if (!p) throw new Error('not found');
      return { ok: true, removed: p.label };
    },
  },
];

CEO_TOOLS.push(...GENERIC, ...OWNER, ...JOURNEY, ...DEV, ...PREF_TOOLS);
export const TOOL_BY_NAME = new Map(CEO_TOOLS.map((t) => [t.name, t]));

/** OpenAI tool specs (JSON schema). The content-draft tool is handled in agent.ts. */
export function toolSpecs() {
  return CEO_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: (t.destructive ? '[DESTRUCTIVE · REQUIRES APPROVAL] ' : t.write ? '[REQUIRES DANIEL APPROVAL] ' : '') + t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> },
  }));
}

/** Hebrew capability manifest for the system prompt, generated from the registry so it never drifts. */
const CAP_HE: Record<string, string> = {
  metrics: 'מדדים מרכזיים לתקופה', business_metrics: 'MRR, מנויים, נטישה, עלות AI', list_users: 'רשימת משתמשים (לא פעילים/חדשים/בלי אונבורדינג)',
  user_detail: 'פרטי משתמש, משימות, אירועים, SOS', almog_quality_sample: 'דגימת הודעות של אלמוג לבקרת איכות', errors: 'שגיאות שרת',
  content_overview: 'מפת תחנות ושיעורים', list_pending_actions: 'פעולות שמחכות לאישור', set_test_user: 'סימון משתמש בדיקה',
  pause_user_notifications: 'השהיית/חידוש התראות למשתמש', set_step_published: 'פרסום/הסתרת שיעור', create_draft_step: 'טיוטת שיעור חדשה',
  create_demo_link: 'קישור דמו לאורח', db_read: 'קריאה מכל טבלת ניהול', db_insert: 'הוספת רשומה', db_update: 'עדכון רשומות',
  db_delete: 'מחיקה (בלתי הפיך)', send_user_notification: 'התראה למשתמש בקול של אלמוג', delete_user: 'מחיקת חשבון (בלתי הפיך)',
  owner_tasks_list: 'משימות פתוחות של דניאל', owner_task_create: 'פתיחת משימה לדניאל', owner_task_update: 'עדכון משימה של דניאל',
  journey_agent_start: 'הפעלת סוכן התוכן על חומר גלם', journey_agent_reply: 'תשובה לסוכן התוכן', journey_agent_sessions_list: 'סשנים של סוכן התוכן',
  recent_digest_findings: 'סיכומים אחרונים שאפשר להעביר לאור', forward_to_developer: 'העברת ממצא טכני לאור (אוטומטי, בלי אישור)', send_ops_access_link: 'כפתור כניסה ל-Ops (לצ׳אט המאומת)', report_ops_lockout: 'דיווח נעילה מחוץ ל-Ops לאור (מוצא אחרון)', or_work_status: 'על מה אור עובד (סטטוסים)',
  owner_pref_set: 'שמירת הוראה קבועה של דניאל (שבת, שעות שקט, השתקה) שנאכפת בקוד', owner_prefs_list: 'ההוראות הקבועות של דניאל', owner_pref_remove: 'ביטול הוראה קבועה',
};
export function capabilityManifest(): string {
  return CEO_TOOLS.map((t) => `• ${t.name}: ${CAP_HE[t.name] ?? t.description.slice(0, 80)}${t.destructive ? ' [בלתי הפיך]' : t.write ? ' [באישור]' : ''}`).join('\n');
}
