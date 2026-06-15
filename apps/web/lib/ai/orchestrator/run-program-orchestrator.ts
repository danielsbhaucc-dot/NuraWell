/**
 * 🫀 לב הפעימה — Program Orchestrator.
 *
 * זה ה"מנצח" שרץ מתוך ה-cron כל ~30 דקות ומנהל את *כל* מסע המשתמש:
 *   1. אוסף אותות פעילות (gatherProgramSignals).
 *   2. מסווג מצב דטרמיניסטית (evaluateProgramState).
 *   3. שומר program_state ב-profiles (תמיד — זול).
 *   4. אם עובר את שערי הבטיחות והתדירות → מנסח הצעה יזומה (LLM),
 *      שומר ב-pending_ai_proposal ושולח נוטיפיקציה.
 *
 * 🛡️ שערים (כמו במפרט "רגע לפני", פרק 5.2):
 *   - avoid_push פעיל → לא שולחים הצעה (אבל כן מעדכנים מצב).
 *   - life-context = minimal (אשפוז/אבל/משבר) → לא שולחים הצעה.
 *   - כבר יש הצעה פתוחה שטרם נענתה → לא דורסים אותה.
 *   - כבר נשלחה הצעת אורקסטרטור היום → תקרת תדירות (≤1/יום).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isAvoidPushActive } from '../avoid-push';
import { getAlmogPushTier } from '../life-context';
import { israelDateKey } from '../onboarding-check-in-time';
import { firstNameFromFull } from '../../onboarding/profile-summary-rows';
import { afterAlmogInAppNotification } from '../../notifications/after-almog-insert';
import type { AiUserContext } from '../memory';
import { gatherProgramSignals } from './gather-program-signals';
import { evaluateProgramState, type ProgramProposalKind, type ProgramState } from './program-state';
import { buildProgramProposal } from './build-program-proposal';
import { writePendingProposal, writeProgramState } from './program-store';

const PROPOSAL_ICON: Record<ProgramProposalKind, string> = {
  level_up: '🚀',
  daily_kickoff: '💪',
  pivot: '💙',
};

export const PROGRAM_ORCHESTRATOR_SOURCE = 'almog_program_orchestrator';
const MAX_PROGRAM_ORCHESTRATIONS_PER_TICK = 150;

export type OrchestrateUserResult = {
  userId: string;
  state: ProgramState;
  reason: string;
  emitted: boolean;
  kind?: ProgramProposalKind;
  /** סיבת דילוג על שליחת ההצעה (אם לא נשלחה). */
  skippedReason?: string;
};

type ProfileForOrchestration = {
  id: string;
  full_name: string | null;
  ai_context: AiUserContext | null;
  pending_ai_proposal: unknown;
};

/** האם כבר נשלחה הצעת אורקסטרטור היום (תקרת תדירות ≤1/יום). */
async function orchestratorTouchedToday(
  admin: SupabaseClient,
  userId: string,
  now: Date
): Promise<boolean> {
  const todayKey = israelDateKey(now);
  const startIso = new Date(
    new Date(now.getTime()).setHours(0, 0, 0, 0) - 26 * 60 * 60 * 1000
  ).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('notifications')
    .select('created_at, metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', startIso)
    .order('created_at', { ascending: false })
    .limit(20);

  for (const row of (data ?? []) as Array<{ created_at?: string; metadata?: { source?: string } }>) {
    if (row.metadata?.source !== PROGRAM_ORCHESTRATOR_SOURCE) continue;
    if (typeof row.created_at !== 'string') continue;
    if (israelDateKey(new Date(row.created_at)) === todayKey) return true;
  }
  return false;
}

/**
 * מטפל במשתמש בודד. תמיד מעדכן program_state; שולח הצעה רק אם עובר את כל
 * השערים. ב-dryRun לא כותב ולא שולח דבר.
 */
export async function orchestrateProgramForUser(
  admin: SupabaseClient,
  profile: ProfileForOrchestration,
  opts: { now?: Date; dryRun?: boolean } = {}
): Promise<OrchestrateUserResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const aiCtx = (profile.ai_context ?? {}) as AiUserContext;

  const { signals, companion, doneTodayCount } = await gatherProgramSignals(
    admin,
    profile.id,
    aiCtx,
    now
  );
  void doneTodayCount;

  const decision = evaluateProgramState(signals);

  if (!dryRun) {
    await writeProgramState(admin, profile.id, decision.state).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[program-orchestrator] writeProgramState failed', profile.id, err);
    });
  }

  const base: OrchestrateUserResult = {
    userId: profile.id,
    state: decision.state,
    reason: decision.reason,
    emitted: false,
    kind: decision.proposalKind,
  };

  // ── שערי שליחת הצעה ──────────────────────────────────────────────
  if (isAvoidPushActive(aiCtx as Record<string, unknown>)) {
    return { ...base, skippedReason: 'avoid_push' };
  }
  if (getAlmogPushTier(aiCtx) === 'minimal') return { ...base, skippedReason: 'life_pause' };
  if (profile.pending_ai_proposal) return { ...base, skippedReason: 'proposal_pending' };

  if (dryRun) return { ...base, skippedReason: 'dry_run' };

  if (await orchestratorTouchedToday(admin, profile.id, now)) {
    return { ...base, skippedReason: 'frequency_cap_today' };
  }

  // ── ניסוח ההצעה (LLM + fallback) ────────────────────────────────
  const firstName = firstNameFromFull(profile.full_name) || 'משתמש';
  const proposal = await buildProgramProposal({
    decision,
    firstName,
    aiCtx,
    companion,
    consecutiveCompletedDays: signals.consecutiveCompletedDays,
  });

  await writePendingProposal(admin, profile.id, proposal);

  // ── נוטיפיקציה — מקור אמת לתדירות + מנוע ה-push ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: profile.id,
    type: 'ai_message',
    title: proposal.headline,
    body: proposal.body,
    icon_emoji: PROPOSAL_ICON[proposal.kind],
    action_url: '/home',
    is_read: false,
    is_sent: false,
    send_at: now.toISOString(),
    metadata: {
      source: PROGRAM_ORCHESTRATOR_SOURCE,
      expects_reply: false,
      program_state: decision.state,
      proposal_kind: proposal.kind,
      proposal_id: proposal.id,
      requires_buyin: proposal.requires_buyin,
      model: proposal.model,
    },
  });

  if (notifyError) {
    // eslint-disable-next-line no-console
    console.warn('[program-orchestrator] notification insert failed', profile.id, notifyError.message);
  } else {
    afterAlmogInAppNotification(profile.id, proposal.headline, proposal.body);
  }

  return { ...base, emitted: true };
}

export type RunOrchestratorResult = {
  enabled: boolean;
  scanned: number;
  processed: number;
  emitted: number;
  by_state: Record<ProgramState, number>;
  errors: string[];
  sample: OrchestrateUserResult[];
};

/**
 * סורק משתמשים פעילים ומריץ את האורקסטרטור. מסובב את העיבוד לפי
 * program_state_updated_at (הישנים ביותר קודם) כדי שלא נטפל תמיד באותם N.
 */
export async function runProgramOrchestrator(
  admin: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {}
): Promise<RunOrchestratorResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;

  const by_state: Record<ProgramState, number> = {
    ready_to_advance: 0,
    maintaining: 0,
    struggling: 0,
  };
  const errors: string[] = [];
  const sample: OrchestrateUserResult[] = [];

  const cap = Math.min(
    500,
    Math.max(1, opts.limit ?? MAX_PROGRAM_ORCHESTRATIONS_PER_TICK)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, full_name, ai_context, pending_ai_proposal, program_state_updated_at')
    .eq('onboarding_completed', true)
    .order('program_state_updated_at', { ascending: true, nullsFirst: true })
    .limit(cap);

  if (error) {
    errors.push(`scan_failed:${error.message}`);
    return { enabled: true, scanned: 0, processed: 0, emitted: 0, by_state, errors, sample };
  }

  const profiles = (rows ?? []) as ProfileForOrchestration[];
  let processed = 0;
  let emitted = 0;

  for (const profile of profiles) {
    try {
      const result = await orchestrateProgramForUser(admin, profile, { now, dryRun });
      processed++;
      by_state[result.state]++;
      if (result.emitted) emitted++;
      if (sample.length < 10) sample.push(result);
    } catch (e) {
      errors.push(`${profile.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    enabled: true,
    scanned: profiles.length,
    processed,
    emitted,
    by_state,
    errors: errors.slice(0, 20),
    sample,
  };
}
