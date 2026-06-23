/**
 * יצירת משימת הקלה מ-SOS — מקפיאה את המשימה המקורית ומוסיפה צעד זמני למשימות אלמוג.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { AssignmentRelation, BlockerProposal } from '../almog-commitments/types';
import { normalizeFrictionCategory } from '../almog-commitments/friction';
import { defaultInterventionReminderIso } from '../almog-commitments/intervention-engine';
import type { SosFocusTask } from './sos-memory';
import type { SosIntervention } from './sos';

const STALE_DAYS = 2;

function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function proposalFromIntervention(intervention: SosIntervention): BlockerProposal {
  return {
    label: intervention.label,
    strategy_type: intervention.strategy_type,
    micro_step: intervention.micro_step,
    relation: 'eases',
  };
}

export async function saveSosCoachOnBlocker(params: {
  admin: SupabaseClient;
  userId: string;
  blockerId: string;
  intervention: SosIntervention;
  focusTask: SosFocusTask | null;
  nowIso: string;
}): Promise<void> {
  const empathy =
    params.intervention.message.split('\n\n')[0]?.trim() || params.intervention.message;
  const coachState = {
    empathy,
    proposal: proposalFromIntervention(params.intervention),
    generated_at: params.nowIso,
  };

  const { data: blocker } = await params.admin
    .from('almog_blockers')
    .select('metadata')
    .eq('id', params.blockerId)
    .eq('user_id', params.userId)
    .maybeSingle();

  const existingMeta = (blocker as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};

  await params.admin
    .from('almog_blockers')
    .update({
      strategy: params.intervention.micro_step,
      metadata: {
        ...existingMeta,
        source: 'almog_sos',
        coach: coachState,
        focus_task_id: params.focusTask?.id ?? null,
        focus_task_title: params.focusTask?.title ?? null,
        journey_step_id: params.focusTask?.stepId ?? null,
      },
    })
    .eq('id', params.blockerId)
    .eq('user_id', params.userId);
}

export async function createSosEaseAssignment(params: {
  admin: SupabaseClient;
  userId: string;
  blockerId: string;
  intervention: SosIntervention;
  focusTask: SosFocusTask | null;
  nowIso: string;
  now?: Date;
}): Promise<{ assignment_id: string; frozen_journey_task: boolean }> {
  const now = params.now ?? new Date();
  const proposal = proposalFromIntervention(params.intervention);
  const category = normalizeFrictionCategory(params.intervention.category);
  const taskKey = dedupeKey(`sos|${params.blockerId}|${proposal.micro_step}`);

  let parentAssignmentId: string | null = null;
  if (params.focusTask?.id) {
    const journeyKey = dedupeKey(`journey|${params.focusTask.id}`);
    const { data: existingParent } = await params.admin
      .from('almog_assignments')
      .select('id, status')
      .eq('user_id', params.userId)
      .eq('dedupe_key', journeyKey)
      .maybeSingle();

    if (existingParent) {
      parentAssignmentId = (existingParent as { id: string }).id;
    } else if (params.focusTask.stepId) {
      const { data: insertedParent, error: parentErr } = await params.admin
        .from('almog_assignments')
        .insert({
          user_id: params.userId,
          title: params.focusTask.title,
          reason: params.focusTask.stepTitle ?? 'מהמסע',
          detail: null,
          status: 'frozen',
          schedule: 'daily',
          given_at: params.nowIso,
          parent_assignment_id: null,
          relation: 'standalone',
          dedupe_key: journeyKey,
          created_by: 'almog',
          metadata: {
            source: 'sos_journey_mirror',
            journey_task_id: params.focusTask.id,
            journey_step_id: params.focusTask.stepId,
            frozen_at: params.nowIso,
            frozen_reason: 'sos_hard_moment',
          },
          history: [
            {
              at: params.nowIso,
              action: 'frozen',
              note: 'הוקפאה זמנית — רגע קשה מהבית',
            },
          ],
        })
        .select('id')
        .maybeSingle();

      if (!parentErr && insertedParent) {
        parentAssignmentId = (insertedParent as { id: string }).id;
      }
    }
  }

  let assignmentId: string;
  const { data: existingAssign } = await params.admin
    .from('almog_assignments')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', taskKey)
    .maybeSingle();

  const relation: AssignmentRelation = parentAssignmentId ? 'eases' : 'standalone';
  const schedule = relation === 'eases' ? 'daily' : 'one_time';
  const experimentHours = relation === 'eases' ? 48 : 24;

  if (existingAssign) {
    assignmentId = (existingAssign as { id: string }).id;
    await params.admin
      .from('almog_assignments')
      .update({
        status: 'active',
        parent_assignment_id: parentAssignmentId,
        relation,
        schedule,
        title: proposal.micro_step,
        detail: proposal.label,
      })
      .eq('id', assignmentId)
      .eq('user_id', params.userId);
  } else {
    const { data: inserted, error: assignErr } = await params.admin
      .from('almog_assignments')
      .insert({
        user_id: params.userId,
        title: proposal.micro_step,
        reason: null,
        detail: proposal.label,
        status: 'active',
        schedule,
        given_at: params.nowIso,
        parent_assignment_id: parentAssignmentId,
        relation,
        dedupe_key: taskKey,
        created_by: 'almog',
        metadata: {
          source: 'sos_ease',
          blocker_id: params.blockerId,
          strategy_type: proposal.strategy_type,
          relation,
          experiment_hours: experimentHours,
          journey_task_id: params.focusTask?.id ?? null,
          journey_step_id: params.focusTask?.stepId ?? null,
          stale_after_days: STALE_DAYS,
        },
        history: [{ at: params.nowIso, action: 'reactivated', note: 'נוצר מרגע קשה — צעד הקלה' }],
      })
      .select('id')
      .maybeSingle();

    if (assignErr || !inserted) {
      throw new Error(assignErr?.message ?? 'Failed to create SOS ease assignment');
    }
    assignmentId = (inserted as { id: string }).id;
  }

  if (parentAssignmentId) {
    const { data: orig } = await params.admin
      .from('almog_assignments')
      .select('id, history')
      .eq('id', parentAssignmentId)
      .eq('user_id', params.userId)
      .maybeSingle();
    if (orig) {
      const origHist = Array.isArray((orig as { history?: unknown }).history)
        ? ((orig as { history: Record<string, unknown>[] }).history)
        : [];
      await params.admin
        .from('almog_assignments')
        .update({
          status: 'frozen',
          history: [
            ...origHist,
            {
              at: params.nowIso,
              action: 'frozen',
              note: `הוקלה זמנית — נתחיל מ: ${proposal.micro_step}`,
            },
          ].slice(-50),
        })
        .eq('id', parentAssignmentId)
        .eq('user_id', params.userId);
    }
  }

  const { data: intervention } = await params.admin
    .from('almog_interventions')
    .insert({
      user_id: params.userId,
      blocker_id: params.blockerId,
      barrier_type: category,
      strategy: proposal.micro_step,
      strategy_type: proposal.strategy_type,
      outcome: 'pending',
      assignment_id: assignmentId,
      metadata: {
        source: 'sos_ease',
        micro_step: proposal.micro_step,
        focus_task_id: params.focusTask?.id ?? null,
        focus_task_title: params.focusTask?.title ?? null,
      },
    })
    .select('id')
    .maybeSingle();

  const fireAt = defaultInterventionReminderIso(now);
  const remKey = `sos-ease|${params.blockerId}|${taskKey.slice(0, 40)}|${fireAt.slice(0, 10)}`;
  const { data: existingRem } = await params.admin
    .from('scheduled_reminders')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', remKey)
    .maybeSingle();

  if (!existingRem) {
    await params.admin.from('scheduled_reminders').insert({
      user_id: params.userId,
      fire_at: fireAt,
      kind: 'followup',
      title: 'אלמוג חושב עליך 🌿',
      body: `רק בודק איתך — איך הלך עם "${proposal.micro_step}"? גם אם לא יצא, בא נדבר על זה.`,
      assignment_id: assignmentId,
      blocker_id: params.blockerId,
      status: 'pending',
      dedupe_key: remKey,
      metadata: {
        source: 'sos_ease_followup',
        intervention_id: (intervention as { id: string } | null)?.id ?? null,
        stale_after_days: STALE_DAYS,
      },
    });
  }

  await params.admin
    .from('almog_blockers')
    .update({
      related_assignment_id: assignmentId,
      status: 'improving',
    })
    .eq('id', params.blockerId)
    .eq('user_id', params.userId);

  return {
    assignment_id: assignmentId,
    frozen_journey_task: Boolean(parentAssignmentId),
  };
}

/** מסנן אירועי SOS ישנים שלא קיבלו משוב — אחרי יומיים כבר לא רלוונטיים. */
export function filterRelevantSosEvents<T extends { created_at: string; outcome: string }>(
  events: T[],
  staleDays = STALE_DAYS
): T[] {
  const cutoff = Date.now() - staleDays * 24 * 60 * 60_000;
  return events.filter((ev) => {
    if (ev.outcome !== 'unknown') return true;
    return new Date(ev.created_at).getTime() >= cutoff;
  });
}
