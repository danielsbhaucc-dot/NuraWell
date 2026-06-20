import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchInterventionMemory,
  generateBlockerPivot,
  type ActiveTaskRef,
  type InterventionMemoryRow,
} from '../almog-commitments/intervention-engine';
import { normalizeFrictionCategory, normalizeStrategyType, type FrictionCategory, type StrategyType } from '../almog-commitments/friction';
import type { SosIntervention } from './sos';
import { buildDeterministicSosFallback, buildSosInterventionFromPivot, withTimeout } from './sos';

export type SosFocusTask = {
  id: string;
  title: string;
  emoji?: string;
  stepTitle?: string;
  stepId?: string;
  pendingSlots?: string[];
};

export type SosMemorySnippet = {
  strategy: string;
  strategy_type: string;
  barrier_type: string;
  outcome: 'helped' | 'not_helped' | 'pending' | 'resolved';
  task_title: string | null;
  created_at: string;
};

export type RecentSosForChat = {
  created_at: string;
  outcome: string;
  trigger: string | null;
  task_title: string | null;
  strategy_type: string | null;
  note: string | null;
};

export type SosFlowResult = {
  intervention: SosIntervention;
  memoryHint: string | null;
  interventionId: string | null;
  blockerId: string | null;
  usedFallback: boolean;
};

export type SosRecentEvent = {
  id: string;
  outcome: string;
  trigger: string | null;
  strategy_offered: string | null;
  task_title: string | null;
  created_at: string;
};

function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function outcomeLabel(outcome: string): 'helped' | 'not_helped' | 'pending' | 'resolved' {
  if (outcome === 'helped' || outcome === 'resolved') return outcome === 'resolved' ? 'resolved' : 'helped';
  if (outcome === 'not_helped') return 'not_helped';
  return 'pending';
}

export type FetchSosContextOptions = {
  memoryLimit?: number;
  eventsLimit?: number;
};

export async function fetchSosContext(
  admin: SupabaseClient,
  userId: string,
  options: FetchSosContextOptions = {}
): Promise<{ memory: SosMemorySnippet[]; recent_events: SosRecentEvent[] }> {
  const memoryLimit = Math.min(30, Math.max(1, options.memoryLimit ?? 8));
  const eventsLimit = Math.min(50, Math.max(1, options.eventsLimit ?? 5));

  const [interventionsRes, eventsRes] = await Promise.all([
    admin
      .from('almog_interventions')
      .select('strategy, strategy_type, barrier_type, outcome, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(memoryLimit),
    admin
      .from('guardian_sos_events')
      .select('id, outcome, trigger, strategy_offered, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(eventsLimit),
  ]);

  const memory: SosMemorySnippet[] = ((interventionsRes.data ?? []) as Array<{
    strategy: string;
    strategy_type: string;
    barrier_type: string;
    outcome: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => {
    const meta = row.metadata ?? {};
    const taskTitle =
      typeof meta.focus_task_title === 'string'
        ? meta.focus_task_title
        : typeof meta.journey_task_title === 'string'
          ? meta.journey_task_title
          : null;
    return {
      strategy: row.strategy,
      strategy_type: row.strategy_type,
      barrier_type: row.barrier_type,
      outcome: outcomeLabel(row.outcome),
      task_title: taskTitle,
      created_at: row.created_at,
    };
  });

  const recent_events: SosRecentEvent[] = ((eventsRes.data ?? []) as Array<{
    id: string;
    outcome: string;
    trigger: string | null;
    strategy_offered: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => {
    const meta = row.metadata ?? {};
    return {
      id: row.id,
      outcome: row.outcome,
      trigger: row.trigger,
      strategy_offered: row.strategy_offered,
      task_title: typeof meta.focus_task_title === 'string' ? meta.focus_task_title : null,
      created_at: row.created_at,
    };
  });

  return { memory, recent_events };
}

export function pickMemoryHint(
  memory: InterventionMemoryRow[],
  category: FrictionCategory,
  strategyType: string
): string | null {
  const helped = memory.find(
    (m) =>
      normalizeFrictionCategory(m.barrier_type) === category &&
      m.strategy_type === strategyType &&
      (m.outcome === 'helped' || m.outcome === 'resolved')
  );
  if (helped) return `פעם קודמת "${helped.strategy}" עזר לך ברגע דומה.`;
  const failed = memory.find(
    (m) =>
      normalizeFrictionCategory(m.barrier_type) === category &&
      m.strategy_type === strategyType &&
      m.outcome === 'not_helped'
  );
  if (failed) return `ננסה גישה אחרת — "${failed.strategy}" פחות התאים לך.`;
  return null;
}

export async function getLinkableActiveTasks(
  admin: SupabaseClient,
  userId: string
): Promise<{ id: string; title: string }[]> {
  const { data } = await admin
    .from('almog_assignments')
    .select('id, title, relation')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('given_at', { ascending: false })
    .limit(8);

  return ((data ?? []) as { id: string; title: string; relation: string | null }[])
    .filter((a) => !a.relation || a.relation === 'standalone')
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title }));
}

export function buildActiveTaskRefs(
  focusTask: SosFocusTask | null,
  linkable: { id: string; title: string }[]
): { activeTasks: ActiveTaskRef[]; originalTaskTitle: string | null } {
  const merged: { id: string; title: string }[] = [];
  if (focusTask?.title) {
    merged.push({ id: focusTask.id, title: focusTask.title });
  }
  for (const task of linkable) {
    if (!merged.some((m) => m.id === task.id)) merged.push(task);
  }

  const activeTasks = merged.slice(0, 6).map((t, i) => ({
    ref: `T${i + 1}`,
    title: t.title,
  }));

  return {
    activeTasks,
    originalTaskTitle: focusTask?.title ?? merged[0]?.title ?? null,
  };
}

export async function ensureSosBlocker(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  trigger: FrictionCategory;
  nowIso: string;
}): Promise<string> {
  const taskKey = params.focusTask?.id ?? 'general';
  const dedupe = dedupeKey(`sos|${taskKey}`);
  const description = params.focusTask?.title
    ? `רגע קשה עם "${params.focusTask.title}"`
    : 'רגע קשה — SOS מהבית';

  const { data: existing } = await params.admin
    .from('almog_blockers')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', dedupe)
    .maybeSingle();

  if (existing) {
    await params.admin
      .from('almog_blockers')
      .update({
        status: 'open',
        description,
        category: params.trigger,
        last_checked_at: params.nowIso,
        metadata: {
          source: 'almog_sos',
          focus_task_id: params.focusTask?.id ?? null,
          focus_task_title: params.focusTask?.title ?? null,
        },
      })
      .eq('id', (existing as { id: string }).id)
      .eq('user_id', params.userId);
    return (existing as { id: string }).id;
  }

  const { data: inserted, error } = await params.admin
    .from('almog_blockers')
    .insert({
      user_id: params.userId,
      description,
      category: params.trigger,
      status: 'open',
      dedupe_key: dedupe,
      last_checked_at: params.nowIso,
      metadata: {
        source: 'almog_sos',
        focus_task_id: params.focusTask?.id ?? null,
        focus_task_title: params.focusTask?.title ?? null,
      },
      history: [{ at: params.nowIso, status: 'open', note: 'SOS — רגע קשה' }],
    })
    .select('id')
    .maybeSingle();

  if (error || !inserted) {
    throw new Error('SOS_BLOCKER_CREATE_FAILED');
  }

  return (inserted as { id: string }).id;
}

export async function recordSosIntervention(params: {
  admin: SupabaseClient;
  userId: string;
  blockerId: string;
  trigger: FrictionCategory;
  intervention: SosIntervention;
  focusTask: SosFocusTask | null;
  note: string;
}): Promise<string | null> {
  const { data, error } = await params.admin
    .from('almog_interventions')
    .insert({
      user_id: params.userId,
      blocker_id: params.blockerId,
      barrier_type: params.trigger,
      strategy: params.intervention.label,
      strategy_type: params.intervention.strategy_type,
      outcome: 'pending',
      metadata: {
        source: 'almog_sos',
        focus_task_id: params.focusTask?.id ?? null,
        focus_task_title: params.focusTask?.title ?? null,
        focus_task_emoji: params.focusTask?.emoji ?? null,
        step_title: params.focusTask?.stepTitle ?? null,
        note: params.note || null,
        micro_step: params.intervention.micro_step,
      },
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[sos] intervention insert failed', error);
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}

export async function recordSosOutcome(params: {
  admin: SupabaseClient;
  userId: string;
  eventId: string;
  interventionId: string | null;
  guardianOutcome: 'passed' | 'fell';
  helped: boolean;
}): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const interventionOutcome = params.helped ? 'helped' : 'not_helped';

  const { error: eventError } = await params.admin
    .from('guardian_sos_events')
    .update({ outcome: params.guardianOutcome })
    .eq('id', params.eventId)
    .eq('user_id', params.userId);

  if (eventError) {
    console.error('[sos] event outcome update failed', eventError);
    return false;
  }

  if (params.interventionId) {
    const { error: intError } = await params.admin
      .from('almog_interventions')
      .update({
        outcome: interventionOutcome,
        resolved_at: nowIso,
      })
      .eq('id', params.interventionId)
      .eq('user_id', params.userId);

    if (intError) {
      console.error('[sos] intervention outcome update failed', intError);
    }
  }

  const { data: eventRow } = await params.admin
    .from('guardian_sos_events')
    .select('metadata')
    .eq('id', params.eventId)
    .eq('user_id', params.userId)
    .maybeSingle();

  const meta = ((eventRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const focusTask: SosFocusTask | null =
    typeof meta.focus_task_title === 'string' && meta.focus_task_title
      ? {
          id: typeof meta.focus_task_id === 'string' ? meta.focus_task_id : meta.focus_task_title,
          title: meta.focus_task_title,
          stepId: typeof meta.step_id === 'string' ? meta.step_id : undefined,
        }
      : null;
  const blockerId = typeof meta.blocker_id === 'string' ? meta.blocker_id : null;
  const pivotAttempt = typeof meta.pivot_attempt === 'number' ? meta.pivot_attempt : 0;

  try {
    const { handleSosOutcomeCare } = await import('./sos-care-loop');
    await handleSosOutcomeCare({
      admin: params.admin,
      userId: params.userId,
      eventId: params.eventId,
      focusTask,
      blockerId,
      guardianOutcome: params.guardianOutcome,
      helped: params.helped,
      pivotExhausted: params.guardianOutcome === 'fell' && pivotAttempt >= 2,
    });
  } catch (e) {
    console.error('[sos] outcome care loop failed', e);
  }

  return true;
}

function buildSosDescription(params: {
  focusTask: SosFocusTask | null;
  note: string;
  category: FrictionCategory;
  pivotNote?: string;
}): string {
  const parts = [
    params.focusTask?.title
      ? `SOS בזמן אמת: קשה לי עם "${params.focusTask.title}"${params.focusTask.stepTitle ? ` (${params.focusTask.stepTitle})` : ''}.`
      : 'SOS בזמן אמת: המשתמש סימן שקשה לו עכשיו.',
    params.note ? `פרטים: ${params.note}` : null,
    params.pivotNote ?? null,
    `טון פנימי: ${params.category}.`,
    'צריך התערבות קצרה, לא טיפולית, בלי אשמה ובלי עידוד הגבלה.',
  ].filter(Boolean);
  return parts.join(' ');
}

function personalizeFallback(
  intervention: SosIntervention,
  focusTask: SosFocusTask | null
): SosIntervention {
  if (!focusTask?.title) return intervention;
  return {
    ...intervention,
    message: `יופי שעצרת. "${focusTask.title}" יכולה להרגיש כבדה עכשיו — וזה בסדר.`,
    micro_step: `בוא ננסה רק חלק קטן מ"${focusTask.title}" — 60 שניות, בלי לחץ.`,
  };
}

/** יוצר התערבות SOS + שומר תמיד blocker/intervention — גם ב-fallback. */
export async function executeSosFlow(params: {
  admin: SupabaseClient;
  userId: string;
  trigger: FrictionCategory;
  focusTask: SosFocusTask | null;
  note: string;
  nowIso: string;
  failedStrategyTypes?: StrategyType[];
  attemptCount?: number;
  pivotFromLabel?: string | null;
}): Promise<SosFlowResult> {
  const category = normalizeFrictionCategory(params.trigger);
  const linkable = await getLinkableActiveTasks(params.admin, params.userId);
  const { activeTasks, originalTaskTitle } = buildActiveTaskRefs(params.focusTask, linkable);
  const memory = await fetchInterventionMemory(params.admin, params.userId, 6);
  const failedTypes = (params.failedStrategyTypes ?? []).map(normalizeStrategyType);
  const pivotNote = params.pivotFromLabel
    ? `PIVOT: "${params.pivotFromLabel}" לא עזר — צריך גישה אחרת.`
    : undefined;
  const description = buildSosDescription({
    focusTask: params.focusTask,
    note: params.note,
    category,
    pivotNote,
  });

  let intervention = personalizeFallback(buildDeterministicSosFallback(params.trigger), params.focusTask);
  let usedFallback = true;
  let memoryHint: string | null = null;

  try {
    const pivot = await withTimeout(
      generateBlockerPivot({
        description,
        category: params.trigger,
        currentStrategy: params.pivotFromLabel ?? null,
        attemptCount: params.attemptCount ?? failedTypes.length,
        memory,
        activeTasks,
        originalTaskTitle,
        failedStrategyTypes: failedTypes,
        pivotFromStrategy: params.pivotFromLabel ?? null,
      })
    );
    intervention = buildSosInterventionFromPivot(pivot);
    usedFallback = false;
    memoryHint = pickMemoryHint(memory, category, intervention.strategy_type);
  } catch (error) {
    if ((error as Error)?.message !== 'SOS_LLM_TIMEOUT') {
      console.error('[sos] intervention fallback used', error);
    }
  }

  const blockerId = await ensureSosBlocker({
    admin: params.admin,
    userId: params.userId,
    focusTask: params.focusTask,
    trigger: category,
    nowIso: params.nowIso,
  });

  const interventionId = await recordSosIntervention({
    admin: params.admin,
    userId: params.userId,
    blockerId,
    trigger: category,
    intervention,
    focusTask: params.focusTask,
    note: params.note,
  });

  if (!memoryHint) {
    memoryHint = pickMemoryHint(memory, category, intervention.strategy_type);
  }

  return { intervention, memoryHint, interventionId, blockerId, usedFallback };
}

/** @deprecated — השתמש ב-scheduleSosFollowUpChain מ-sos-care-loop */
export async function scheduleSosFollowUp(params: {
  admin: SupabaseClient;
  userId: string;
  focusTask: SosFocusTask | null;
  eventId: string | null;
  blockerId: string | null;
  now?: Date;
}): Promise<{ scheduled: boolean }> {
  const { scheduleSosFollowUpChain } = await import('./sos-care-loop');
  const result = await scheduleSosFollowUpChain({
    admin: params.admin,
    userId: params.userId,
    focusTask: params.focusTask,
    eventId: params.eventId,
    blockerId: params.blockerId,
    urgency: 'normal',
    now: params.now,
  });
  return { scheduled: result.scheduled };
}

/** מקשר משוב "הרמה קשה לי" במסע לזיכרון SOS/חסם משותף. */
export async function linkJourneyLevelHardToSosMemory(params: {
  admin: SupabaseClient;
  userId: string;
  taskId: string;
  taskTitle: string;
  stepId: string;
  blockerId?: string | null;
  nowIso: string;
}): Promise<void> {
  const dedupe = dedupeKey(`sos|${params.taskId}`);
  const { data: blocker } = await params.admin
    .from('almog_blockers')
    .select('id, metadata, history')
    .eq('user_id', params.userId)
    .eq('dedupe_key', dedupe)
    .maybeSingle();

  const metaPatch = {
    journey_too_hard: true,
    journey_task_id: params.taskId,
    journey_step_id: params.stepId,
    journey_blocker_id: params.blockerId ?? null,
    linked_at: params.nowIso,
  };

  if (blocker) {
    const existingMeta = (blocker as { metadata?: Record<string, unknown> }).metadata ?? {};
    const hist = Array.isArray((blocker as { history?: unknown }).history)
      ? ((blocker as { history: { at: string; status: string; note?: string }[] }).history)
      : [];
    await params.admin
      .from('almog_blockers')
      .update({
        description: `רגע קשה + הרמה קשה עם "${params.taskTitle}"`,
        metadata: { ...existingMeta, ...metaPatch },
        history: [
          ...hist,
          { at: params.nowIso, status: 'open', note: 'גם דיווח "הרמה קשה לי" במסע' },
        ].slice(-50),
      })
      .eq('id', (blocker as { id: string }).id)
      .eq('user_id', params.userId);
    return;
  }

  await params.admin.from('almog_blockers').insert({
    user_id: params.userId,
    description: `הרמה קשה עם "${params.taskTitle}"`,
    category: 'motivational',
    status: 'open',
    dedupe_key: dedupe,
    last_checked_at: params.nowIso,
    metadata: {
      source: 'journey_too_hard',
      focus_task_id: params.taskId,
      focus_task_title: params.taskTitle,
      ...metaPatch,
    },
    history: [{ at: params.nowIso, status: 'open', note: 'הרמה קשה לי — מהמסע' }],
  });
}

export async function fetchRecentSosForChat(
  admin: SupabaseClient,
  userId: string,
  hoursBack = 48
): Promise<RecentSosForChat[]> {
  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();
  const { data } = await admin
    .from('guardian_sos_events')
    .select('created_at, outcome, trigger, strategy_offered, metadata')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(4);

  return ((data ?? []) as Array<{
    created_at: string;
    outcome: string;
    trigger: string | null;
    strategy_offered: string | null;
    metadata: Record<string, unknown> | null;
  }>).map((row) => {
    const meta = row.metadata ?? {};
    return {
      created_at: row.created_at,
      outcome: row.outcome,
      trigger: row.trigger,
      task_title: typeof meta.focus_task_title === 'string' ? meta.focus_task_title : null,
      strategy_type: row.strategy_offered,
      note: typeof meta.note === 'string' ? meta.note : null,
    };
  });
}

export function formatRecentSosForChat(events: RecentSosForChat[]): string | null {
  if (!events.length) return null;
  const lines = events.map((ev) => {
    const when = new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ev.created_at));
    const task = ev.task_title ? ` על "${ev.task_title}"` : '';
    const outcome =
      ev.outcome === 'passed'
        ? 'עבר'
        : ev.outcome === 'fell'
          ? 'עדיין קשה'
          : ev.outcome === 'escalated'
            ? 'הופנה לעזרה'
            : 'במעקב';
    return `- ${when}${task}: ${outcome}${ev.strategy_type ? ` (הוצע: ${ev.strategy_type})` : ''}`;
  });
  return `[רגעים קשים אחרונים — SOS]\n${lines.join('\n')}\nאם המשתמש מדבר על "קשה לי" / "לפני רגע" — התייחס לזה. אל תשפוט.`;
}

export async function markInterventionNotHelped(
  admin: SupabaseClient,
  userId: string,
  interventionId: string | null
): Promise<void> {
  if (!interventionId) return;
  const nowIso = new Date().toISOString();
  await admin
    .from('almog_interventions')
    .update({ outcome: 'not_helped', resolved_at: nowIso })
    .eq('id', interventionId)
    .eq('user_id', userId);
}
