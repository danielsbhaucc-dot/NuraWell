import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consecutiveDays, levelInfo, shouldAutoStepDown, shouldAutoStepUp, stepDown, stepUp, type LadderLevel, type TaskDefinitionLike } from './ladder';

/**
 * 🧩 lib/tasks — the ONE task module (pages, crons, notifications, AI prompts).
 * Tables: task_definitions (stable ids + ladder), user_task_assignments, task_events.
 */
export type TaskDefinition = TaskDefinitionLike & {
  id: string;
  stable_key: string;
  source: 'step' | 'almog' | 'ai_daily' | 'challenge' | 'guide';
  step_id: string | null;
  habit_key: string;
  description: string | null;
  emoji: string | null;
  schedule: string | null;
};

export type TaskAssignment = {
  id: string;
  user_id: string;
  definition_id: string;
  status: 'offered' | 'accepted' | 'declined' | 'paused' | 'completed' | 'archived';
  is_main: boolean;
  current_level: number;
  original_level: number;
  accepted_at: string | null;
  last_level_change_at: string | null;
  definition: TaskDefinition;
};

export type PlanTask = TaskAssignment & {
  level: LadderLevel;
  doneToday: number;
  targetToday: number;
  streakDays: number;
  canStepDown: boolean;
  canStepUp: boolean;
  history: { kind: string; date_key: string | null; from_level: number | null; to_level: number | null; reason: string | null; occurred_at: string }[];
};

export function israelDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}

const DEF_COLS = 'id, stable_key, source, step_id, habit_key, title, description, emoji, schedule, times_per_day, ladder, floor_level, max_level';

export async function listAssignments(admin: SupabaseClient, userId: string, statuses: TaskAssignment['status'][] = ['accepted']) {
  const { data, error } = await admin
    .from('user_task_assignments')
    .select(`id, user_id, definition_id, status, is_main, current_level, original_level, accepted_at, last_level_change_at, definition:task_definitions(${DEF_COLS})`)
    .eq('user_id', userId)
    .in('status', statuses)
    .order('is_main', { ascending: false })
    .order('accepted_at', { ascending: true });
  if (error) throw new Error(`[tasks] list: ${error.message}`);
  return (data ?? []) as unknown as TaskAssignment[];
}

/** The plan ("התוכנית שלך"): accepted tasks with level, today's progress, streak and history. */
export async function getPlan(admin: SupabaseClient, userId: string, now = new Date()): Promise<PlanTask[]> {
  const assignments = await listAssignments(admin, userId, ['accepted', 'paused']);
  if (!assignments.length) return [];
  const today = israelDateKey(now);
  const since = israelDateKey(new Date(now.getTime() - 60 * 86_400_000));
  const { data: events } = await admin
    .from('task_events')
    .select('assignment_id, kind, date_key, from_level, to_level, reason, occurred_at')
    .eq('user_id', userId)
    .in('assignment_id', assignments.map((a) => a.id))
    .gte('occurred_at', `${since}T00:00:00Z`)
    .order('occurred_at', { ascending: false })
    .limit(2000);
  const byAsg = new Map<string, NonNullable<typeof events>>();
  for (const e of events ?? []) {
    const list = byAsg.get(e.assignment_id as string) ?? [];
    list.push(e);
    byAsg.set(e.assignment_id as string, list);
  }
  return assignments.map((a) => {
    const ev = byAsg.get(a.id) ?? [];
    const level = levelInfo(a.definition, a.current_level);
    const doneToday = ev.filter((e) => e.date_key === today && (e.kind === 'done' || e.kind === 'partial')).length;
    const successDays = [...new Set(ev.filter((e) => e.kind === 'done').map((e) => e.date_key as string))];
    return {
      ...a,
      level,
      doneToday,
      targetToday: level.times_per_day ?? 1,
      streakDays: consecutiveDays(successDays, today),
      canStepDown: stepDown(a.definition, a.current_level).ok,
      canStepUp: stepUp(a.definition, a.current_level).ok,
      history: ev
        .filter((e) => e.kind === 'level_change' || e.kind === 'accepted')
        .map((e) => ({ kind: e.kind as string, date_key: e.date_key as string | null, from_level: e.from_level as number | null, to_level: e.to_level as number | null, reason: e.reason as string | null, occurred_at: e.occurred_at as string })),
    };
  });
}

/** Today's tasks (accepted, active). */
export async function getTodayTasks(admin: SupabaseClient, userId: string, now = new Date()) {
  return (await getPlan(admin, userId, now)).filter((t) => t.status === 'accepted');
}

export type LevelChangeSource = 'user_button' | 'chat' | 'sos' | 'almog_auto' | 'admin';

/**
 * Change level by one step (rules from ladder.ts) and record a `level_change` event with reason.
 * The easier/harder level becomes the user's MAIN task for that habit.
 */
export async function changeTaskLevel(
  admin: SupabaseClient,
  params: { userId: string; assignmentId: string; direction: 'easier' | 'harder'; reason: string; source: LevelChangeSource }
) {
  const { data: a, error } = await admin
    .from('user_task_assignments')
    .select(`id, user_id, current_level, status, definition:task_definitions(${DEF_COLS})`)
    .eq('id', params.assignmentId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (error || !a) return { ok: false as const, reason: 'not_found' as const };
  const def = (a as unknown as { definition: TaskDefinition }).definition;
  const change = params.direction === 'easier' ? stepDown(def, a.current_level as number) : stepUp(def, a.current_level as number);
  if (!change.ok) return change;
  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from('user_task_assignments')
    .update({ current_level: change.to, is_main: true, last_level_change_at: nowIso, updated_at: nowIso })
    .eq('id', params.assignmentId)
    .eq('current_level', change.from); // optimistic lock: no double step on double-tap
  if (upErr) return { ok: false as const, reason: 'update_failed' as const };
  await admin.from('task_events').insert({
    user_id: params.userId,
    assignment_id: params.assignmentId,
    definition_id: def.id,
    kind: 'level_change',
    date_key: israelDateKey(),
    from_level: change.from,
    to_level: change.to,
    level: change.to,
    reason: params.reason.slice(0, 500),
    source: params.source,
  });
  return change;
}

/** User chooses to accept / decline a task offered by a lesson step. */
export async function respondToOffer(
  admin: SupabaseClient,
  params: { userId: string; definitionId: string; accept: boolean }
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('user_task_assignments')
    .upsert(
      {
        user_id: params.userId,
        definition_id: params.definitionId,
        status: params.accept ? 'accepted' : 'declined',
        is_main: params.accept,
        accepted_at: params.accept ? nowIso : null,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,definition_id' }
    )
    .select('id')
    .single();
  if (error) throw new Error(`[tasks] respond: ${error.message}`);
  await admin.from('task_events').insert({
    user_id: params.userId,
    assignment_id: data.id,
    definition_id: params.definitionId,
    kind: params.accept ? 'accepted' : 'declined',
    date_key: israelDateKey(),
    source: 'user_button',
  });
  return data.id as string;
}

/** Record done/partial/missed/skipped for a task (streak updated by DB trigger). */
export async function recordTaskEvent(
  admin: SupabaseClient,
  params: { userId: string; assignmentId: string; kind: 'done' | 'partial' | 'missed' | 'skipped'; slot?: string | null; source?: string; dateKey?: string }
) {
  const { data: a } = await admin
    .from('user_task_assignments')
    .select('definition_id, current_level')
    .eq('id', params.assignmentId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!a) return { ok: false as const };
  const { error } = await admin.from('task_events').insert({
    user_id: params.userId,
    assignment_id: params.assignmentId,
    definition_id: a.definition_id,
    kind: params.kind,
    date_key: params.dateKey ?? israelDateKey(),
    slot: params.slot ?? null,
    level: a.current_level,
    source: params.source ?? 'app',
  });
  return { ok: !error };
}

/**
 * Almog's monitor (called from the daily notification job): steps users back up toward the
 * original task after sustained success at an easier level. Returns the changes made.
 */
export async function runLadderMonitor(admin: SupabaseClient, userId: string, now = new Date()) {
  const plan = await getPlan(admin, userId, now);
  const today = israelDateKey(now);
  const changed: { assignmentId: string; from: number; to: number; direction: 'easier' | 'harder' }[] = [];
  for (const t of plan) {
    if (t.status !== 'accepted') continue;
    const sinceKey = t.last_level_change_at ? israelDateKey(new Date(t.last_level_change_at)) : null;
    const { data: ev } = await admin
      .from('task_events')
      .select('date_key, kind')
      .eq('assignment_id', t.id)
      .in('kind', ['done', 'partial', 'missed'])
      .gte('date_key', israelDateKey(new Date(now.getTime() - 30 * 86_400_000)));
    const rows = (ev ?? []).filter((e) => !sinceKey || (e.date_key as string) > sinceKey);
    const doneDays = [...new Set(rows.filter((e) => e.kind === 'done').map((e) => e.date_key as string))];
    const okDays = [...new Set(rows.filter((e) => e.kind !== 'missed').map((e) => e.date_key as string))];
    const missedDays = [...new Set(rows.filter((e) => e.kind === 'missed').map((e) => e.date_key as string))];
    let direction: 'easier' | 'harder' | null = null;
    let reason = '';
    if (t.current_level < 0 && shouldAutoStepUp({ currentLevel: t.current_level, successDaysSinceChange: doneDays, todayKey: today })) {
      direction = 'harder';
      reason = 'הצלחה עקבית ברמה הנוכחית — חוזרים בהדרגה למשימה המקורית';
    } else if (t.canStepDown && shouldAutoStepDown({ missedDays, successDays: okDays, todayKey: today, lastLevelChangeKey: sinceKey })) {
      direction = 'easier';
      reason = 'כמה ימים של קושי ברצף — אלמוג מקל צעד אחד כדי שזה יהיה בר-ביצוע';
    }
    if (!direction) continue;
    const r = await changeTaskLevel(admin, { userId, assignmentId: t.id, direction, reason, source: 'almog_auto' });
    if (r.ok) changed.push({ assignmentId: t.id, from: r.from, to: r.to, direction });
  }
  return changed;
}

/** Compact Hebrew summary for AI prompts (Almog sees the same plan the user sees). */
export function planForPrompt(plan: PlanTask[]): string {
  if (!plan.length) return 'אין משימות פעילות.';
  return plan
    .map((t) => {
      const lvl = t.current_level === 0 ? 'רמה מקורית' : t.current_level < 0 ? `הוקלה (${t.current_level})` : `הוקשתה (+${t.current_level})`;
      return `- ${t.level.title} [${lvl}] היום ${t.doneToday}/${t.targetToday}, רצף ${t.streakDays} ימים${t.is_main ? ' (משימה ראשית)' : ''}`;
    })
    .join('\n');
}

/**
 * Almog-opened guide → an OFFERED task on the ladder (the user still chooses in "התוכנית שלך").
 * Idempotent per user+guide; never re-offers something the user declined or already has.
 */
export async function offerGuideTask(
  admin: SupabaseClient,
  params: { userId: string; courseId: string; courseTitle: string; reason?: string | null }
) {
  const key = `guide:${params.courseId}`;
  const { data: def } = await admin
    .from('task_definitions')
    .upsert(
      {
        stable_key: key,
        source: 'guide',
        source_ref: params.courseId,
        habit_key: key,
        title: `לעבור על המדריך "${params.courseTitle}" — שיעור אחד ביום`,
        description: params.reason ?? null,
        emoji: '📘',
        times_per_day: 1,
        ladder: [
          { level: -1, title: `לפתוח את המדריך "${params.courseTitle}" ולצפות בשיעור אחד השבוע`, times_per_day: 1 },
          { level: 0, title: `לעבור על המדריך "${params.courseTitle}" — שיעור אחד ביום`, times_per_day: 1 },
        ],
        floor_level: -1,
        max_level: 0,
        created_by: 'almog',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stable_key' }
    )
    .select('id')
    .single();
  if (!def?.id) return null;
  const { data: existing } = await admin
    .from('user_task_assignments')
    .select('id')
    .eq('user_id', params.userId)
    .eq('definition_id', def.id)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: asg } = await admin
    .from('user_task_assignments')
    .insert({ user_id: params.userId, definition_id: def.id, status: 'offered', is_main: false })
    .select('id')
    .single();
  return (asg?.id as string) ?? null;
}

/** Offered tasks waiting for the user's choice. */
export async function listOffers(admin: SupabaseClient, userId: string) {
  return listAssignments(admin, userId, ['offered']);
}
