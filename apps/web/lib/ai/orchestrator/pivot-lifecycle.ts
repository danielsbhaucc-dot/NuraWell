/**
 * 🔁 Pivot lifecycle ("בוא ניקח את זה קטן יותר") — one write path for accept / graduate / undo.
 *
 * Accept parks the user's EXISTING original task (no copy):
 *   - original almog_assignments row  → status 'frozen' (DB trigger archives its plan mirror)
 *   - original plan task (user_task_assignments, non-mirror) → status 'paused'
 *   - ONE tiny task: almog_assignments relation 'eases', parent_assignment_id = original, mirrored into the plan
 *   - ai_context.active_pivot tells Almog what was shrunk, why, and what we grow back to.
 * Graduation (3 good days on the tiny step) or dropping the tiny step restores everything.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { decProfileResult } from '@/lib/crypto/pii-fields';

import { normalizeTitleKey, titlesAreSimilar } from '@/lib/module-api/reminders/lib-ai-almog-commitments-title-similarity';
import { updateAiContext } from '../memory';
import { israelDateKey } from '../onboarding-check-in-time';
import type { ProgramProposal } from './program-state';

type Admin = SupabaseClient;
type Hist = { at: string; action: string; note?: string };

export const PIVOT_SOURCE = 'orchestrator_pivot';
/** An unanswered proposal older than this is stale — never shown, never blocks a fresh one. */
export const PROPOSAL_TTL_MS = 36 * 60 * 60 * 1000;

export function isProposalExpired(p: Pick<ProgramProposal, 'created_at'> | null | undefined, now = new Date()): boolean {
  if (!p) return false;
  const t = Date.parse(p.created_at ?? '');
  return !Number.isFinite(t) || now.getTime() - t > PROPOSAL_TTL_MS;
}

export function pivotDedupeKey(proposalId: string): string {
  return `orchestrator-pivot ${proposalId}`.toLowerCase().slice(0, 80);
}

/**
 * Atomically takes the pending proposal (compare-and-clear on its id). Only the first of two concurrent
 * requests (double tap) gets it back; the other gets null and must not act.
 */
export async function claimPendingProposal(admin: Admin, userId: string, proposalId: string): Promise<ProgramProposal | null> {
  const { data: row } = await admin.from('profiles').select('pending_ai_proposal').eq('id', userId).maybeSingle();
  const proposal = (row?.pending_ai_proposal ?? null) as ProgramProposal | null;
  if (!proposal || proposal.id !== proposalId) return null;
  const { data: cleared, error } = await admin
    .from('profiles')
    .update({ pending_ai_proposal: null })
    .eq('id', userId)
    .eq('pending_ai_proposal->>id', proposalId)
    .select('id');
  if (error || !cleared?.length) return null;
  return proposal;
}

function pickOriginal<T extends { title: string }>(rows: T[], original: string): T | null {
  const key = normalizeTitleKey(original);
  return rows.find((r) => normalizeTitleKey(r.title) === key) ?? rows.find((r) => titlesAreSimilar(r.title, original, 0.72)) ?? null;
}

async function mirrorToPlan(admin: Admin, userId: string, a: { id: string; title: string; schedule: string; detail?: string | null }) {
  const key = `almog:${a.id}`;
  const { data: def } = await admin
    .from('task_definitions')
    .upsert(
      { stable_key: key, source: 'almog', source_ref: a.id, owner_user_id: userId, habit_key: key, title: a.title, description: a.detail ?? null, schedule: a.schedule, created_by: 'almog', updated_at: new Date().toISOString() },
      { onConflict: 'stable_key' }
    )
    .select('id')
    .single();
  if (!def?.id) return null;
  const { data: existing } = await admin.from('user_task_assignments').select('id').eq('user_id', userId).eq('definition_id', def.id).maybeSingle();
  if (existing?.id) return existing.id as string;
  const nowIso = new Date().toISOString();
  const { data: asg } = await admin
    .from('user_task_assignments')
    .insert({ user_id: userId, definition_id: def.id, status: 'accepted', is_main: false, accepted_at: nowIso, offered_at: nowIso, legacy_ref: a.id })
    .select('id')
    .single();
  if (!asg?.id) return null;
  await admin.from('task_events').insert({ user_id: userId, assignment_id: asg.id, definition_id: def.id, kind: 'accepted', date_key: israelDateKey(), source: 'almog' });
  return asg.id as string;
}

export type AcceptPivotResult = {
  micro_assignment_id: string | null;
  parent_assignment_id: string | null;
  paused_plan_ids: string[];
  already: boolean;
};

export async function acceptPivot(admin: Admin, userId: string, proposal: ProgramProposal, now = new Date()): Promise<AcceptPivotResult> {
  const microTitle = proposal.next_step?.title?.trim() ?? '';
  const originalTitle = proposal.next_step?.restore_to?.trim() || null;
  const nowIso = now.toISOString();
  const dedupe = pivotDedupeKey(proposal.id);
  const empty: AcceptPivotResult = { micro_assignment_id: null, parent_assignment_id: null, paused_plan_ids: [], already: false };
  if (!microTitle) return empty;

  const { data: dup } = await admin.from('almog_assignments').select('id, parent_assignment_id').eq('user_id', userId).eq('dedupe_key', dedupe).maybeSingle();
  if (dup) return { ...empty, micro_assignment_id: dup.id as string, parent_assignment_id: (dup.parent_assignment_id as string) ?? null, already: true };

  // 1) the user's existing original Almog task → frozen (parked), never a copy
  type ParentRow = { id: string; title: string; schedule: string; history: Hist[] | null };
  let parent = null as ParentRow | null;
  if (originalTitle) {
    const { data: actives } = await admin
      .from('almog_assignments')
      .select('id, title, schedule, history')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(60);
    parent = pickOriginal((actives ?? []) as ParentRow[], originalTitle);
  }

  // 2) the same task in the plan when it is NOT a mirror of that Almog row (lesson/guide task) → paused
  const pausedPlanIds: string[] = [];
  if (originalTitle) {
    const { data: planRows } = await admin
      .from('user_task_assignments')
      .select('id, legacy_ref, definition:task_definitions(title)')
      .eq('user_id', userId)
      .eq('status', 'accepted');
    const rows = ((planRows ?? []) as unknown as { id: string; legacy_ref: string | null; definition: { title: string } | null }[])
      .filter((r) => r.definition?.title && r.legacy_ref !== parent?.id)
      .map((r) => ({ id: r.id, title: r.definition!.title }));
    const hit = pickOriginal(rows, originalTitle);
    if (hit) pausedPlanIds.push(hit.id);
  }

  const reason = proposal.state === 'struggling' ? 'היה קשה לאחרונה עם המשימה' : 'הקטנה זמנית';
  const schedule = parent?.schedule === 'weekly' || parent?.schedule === 'one_time' ? parent.schedule : 'daily';

  // 3) the single tiny task, linked to the original
  const { data: micro, error: microErr } = await admin
    .from('almog_assignments')
    .insert({
      user_id: userId,
      title: microTitle,
      reason: originalTitle ? `צעד קטן במקום "${originalTitle}" — נחזור אליה בהדרגה` : 'צעד קטן כדי להישאר בתנועה',
      status: 'active',
      schedule,
      given_at: nowIso,
      parent_assignment_id: parent?.id ?? null,
      relation: 'eases',
      dedupe_key: dedupe,
      created_by: 'almog',
      history: [{ at: nowIso, action: 'created', note: 'המשתמש קיבל "בוא ניקח את זה קטן יותר"' }],
      metadata: {
        source: PIVOT_SOURCE,
        proposal_id: proposal.id,
        original_title: originalTitle,
        paused_plan_ids: pausedPlanIds,
        reason,
      },
    })
    .select('id')
    .maybeSingle();
  if (microErr || !micro?.id) {
    // unique dedupe race → the other request already did everything
    const { data: again } = await admin.from('almog_assignments').select('id, parent_assignment_id').eq('user_id', userId).eq('dedupe_key', dedupe).maybeSingle();
    if (again) return { ...empty, micro_assignment_id: again.id as string, parent_assignment_id: (again.parent_assignment_id as string) ?? null, already: true };
    throw new Error(`acceptPivot insert failed: ${microErr?.message ?? 'no row'}`);
  }

  if (parent) {
    await admin
      .from('almog_assignments')
      .update({
        status: 'frozen',
        history: [...(parent.history ?? []), { at: nowIso, action: 'frozen', note: `הוקטנה זמנית ל"${microTitle}"` }].slice(-50),
      })
      .eq('id', parent.id)
      .eq('user_id', userId)
      .eq('status', 'active');
  }
  if (pausedPlanIds.length) {
    await admin.from('user_task_assignments').update({ status: 'paused', updated_at: nowIso }).eq('user_id', userId).in('id', pausedPlanIds).eq('status', 'accepted');
  }

  await mirrorToPlan(admin, userId, { id: micro.id as string, title: microTitle, schedule }).catch((e) =>
    console.warn('[pivot] plan mirror failed', e)
  );

  await updateAiContext(admin, userId, {
    active_pivot: {
      original_title: originalTitle,
      micro_title: microTitle,
      reason,
      since: nowIso,
      micro_assignment_id: micro.id as string,
      parent_assignment_id: parent?.id ?? null,
    },
  }).catch((e) => console.warn('[pivot] ai_context write failed', e));

  return { micro_assignment_id: micro.id as string, parent_assignment_id: parent?.id ?? null, paused_plan_ids: pausedPlanIds, already: false };
}

type MicroRow = { id: string; parent_assignment_id: string | null; metadata: Record<string, unknown> | null; history?: Hist[] | null };

/** Bring the parked original back (parent active + its plan mirror, paused plan tasks accepted) and clear Almog's pivot memory. */
async function restoreOriginal(admin: Admin, userId: string, micro: MicroRow, nowIso: string, note: string) {
  if (micro.parent_assignment_id) {
    const { data: p } = await admin.from('almog_assignments').select('id, status, history').eq('id', micro.parent_assignment_id).eq('user_id', userId).maybeSingle();
    if (p && p.status === 'frozen') {
      await admin
        .from('almog_assignments')
        .update({ status: 'active', given_at: nowIso, history: [...((p.history as Hist[]) ?? []), { at: nowIso, action: 'reactivated', note }].slice(-50) })
        .eq('id', p.id)
        .eq('user_id', userId);
    }
    // the freeze trigger archived the parent's plan mirror — bring the newest one back
    const { data: mirrors } = await admin
      .from('user_task_assignments')
      .select('id')
      .eq('user_id', userId)
      .eq('legacy_ref', micro.parent_assignment_id)
      .eq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (mirrors?.[0]?.id) {
      await admin.from('user_task_assignments').update({ status: 'accepted', updated_at: nowIso }).eq('id', mirrors[0].id).eq('user_id', userId);
    }
  }
  const paused = Array.isArray(micro.metadata?.paused_plan_ids) ? (micro.metadata!.paused_plan_ids as string[]) : [];
  if (paused.length) {
    await admin.from('user_task_assignments').update({ status: 'accepted', updated_at: nowIso }).eq('user_id', userId).in('id', paused).eq('status', 'paused');
  }
  const { data: prof } = await admin.from('profiles').select('ai_context').eq('id', userId).maybeSingle().then(decProfileResult(userId));
  const ap = ((prof as { ai_context?: unknown } | null)?.ai_context as { active_pivot?: { micro_assignment_id?: string } } | null)?.active_pivot;
  if (!ap || ap.micro_assignment_id === micro.id) {
    await updateAiContext(admin, userId, { active_pivot: null }).catch(() => null);
  }
}

/** Tiny step mastered → close it as completed and restore the original. */
export async function graduatePivot(admin: Admin, userId: string, micro: MicroRow, nowIso: string, streak: number) {
  if ((micro.metadata?.source as string) !== PIVOT_SOURCE) return false;
  const { data: cur } = await admin.from('almog_assignments').select('status, history').eq('id', micro.id).eq('user_id', userId).maybeSingle();
  if (!cur || cur.status !== 'active') return false;
  await admin
    .from('almog_assignments')
    .update({ status: 'completed', history: [...((cur.history as Hist[]) ?? []), { at: nowIso, action: 'graduated', note: `${streak} ימים טובים — חוזרים למשימה המקורית` }].slice(-50) })
    .eq('id', micro.id)
    .eq('user_id', userId)
    .eq('status', 'active');
  await restoreOriginal(admin, userId, micro, nowIso, `חזרה הדרגתית אחרי ${streak} ימים טובים בצעד הקטן`);
  return true;
}

/** User dropped the tiny step → don't leave the original parked forever. */
export async function undoPivotOnDrop(admin: Admin, userId: string, micro: MicroRow, nowIso: string) {
  if ((micro.metadata?.source as string) !== PIVOT_SOURCE) return false;
  await restoreOriginal(admin, userId, micro, nowIso, 'הצעד הקטן הוסר — המשימה המקורית חזרה');
  return true;
}
