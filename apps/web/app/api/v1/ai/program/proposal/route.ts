/**
 * 🎛️ Program Orchestrator — API להצעה היזומה.
 *
 *   GET  → מחזיר את program_state ואת ההצעה הפתוחה (ה-Dumb UI מצייר אותה).
 *   POST → תגובת המשתמש: accept / decline. מנקה את ההצעה ומעדכן מצב.
 *
 * ה-UI לא "חושב": הוא רק שולח את ה-decision ואת proposal_id, והשרת מכריע.
 */

import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { updateAiContext } from '../../../../../../lib/ai/memory';
import {
  readProgramRow,
  writePendingProposal,
  writeProgramState,
} from '../../../../../../lib/ai/orchestrator/program-store';
import {
  acceptPivot,
  claimPendingProposal,
  isProposalExpired,
} from '../../../../../../lib/ai/orchestrator/pivot-lifecycle';
import { persistRecoveryInsight } from '@/lib/module-api/reminders/lib-ai-almog-commitments-persist-recovery-insight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();
    const row = await readProgramRow(admin, auth.user.id);

    let proposal = row?.pending_ai_proposal ?? null;
    // stale card (e.g. months old) — never show it, and free the slot for a fresh evaluation
    if (proposal && isProposalExpired(proposal)) {
      await writePendingProposal(admin, auth.user.id, null).catch(() => null);
      proposal = null;
    }

    return NextResponse.json({
      program_state: row?.program_state ?? null,
      proposal,
    });
  } catch (error) {
    console.error('[API /v1/ai/program/proposal GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    let body: { proposal_id?: unknown; decision?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const proposalId = typeof body.proposal_id === 'string' ? body.proposal_id : '';
    const decision = body.decision === 'accept' ? 'accept' : body.decision === 'decline' ? 'decline' : null;
    if (!proposalId || !decision) {
      return NextResponse.json(
        { error: 'proposal_id (string) and decision (accept|decline) are required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    // atomic compare-and-clear: a double tap / second tab gets already_resolved and writes nothing
    const proposal = await claimPendingProposal(admin, auth.user.id, proposalId);
    if (!proposal) {
      return NextResponse.json({ ok: true, already_resolved: true });
    }
    if (decision === 'accept' && isProposalExpired(proposal)) {
      return NextResponse.json({ ok: true, already_resolved: true, expired: true });
    }

    if (decision === 'accept' && proposal.kind === 'level_up' && proposal.next_step?.title) {
      // קבלת "Level Up" → הצעד הבא הופך לפוקוס הנוכחי, והמצב חוזר ל-maintaining.
      await updateAiContext(admin, auth.user.id, {
        current_focus: proposal.next_step.title,
      }).catch((err) => console.error('[program/proposal] current_focus write failed', err));
      await writeProgramState(admin, auth.user.id, 'maintaining').catch((err) =>
        console.error('[program/proposal] state write failed', err)
      );
    }

    if (decision === 'accept' && proposal.kind === 'pivot' && proposal.next_step?.title) {
      // park the EXISTING original + one linked tiny task (no copies) — see pivot-lifecycle.ts
      let res;
      try {
        res = await acceptPivot(admin, auth.user.id, proposal);
      } catch (err) {
        console.error('[program/proposal] pivot accept failed', err);
        // put the card back so the user's retry really applies it
        await writePendingProposal(admin, auth.user.id, proposal).catch(() => null);
        return NextResponse.json({ error: 'pivot_failed' }, { status: 500 });
      }
      if (res.micro_assignment_id && !res.already) {
        await persistRecoveryInsight(admin, {
          userId: auth.user.id,
          taskTitle: proposal.next_step.restore_to ?? proposal.next_step.title,
          kind: 'pivot',
          strategy: proposal.next_step.title,
          outcome: 'pending',
          note: 'המשתמש קיבל pivot מהאורקסטרטור',
        }).catch(() => null);
      }
    }

    return NextResponse.json({ ok: true, decision, kind: proposal.kind });
  } catch (error) {
    console.error('[API /v1/ai/program/proposal POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
