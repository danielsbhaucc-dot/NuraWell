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
import { applyPivotOverride } from '../../../../../../lib/ai/orchestrator/daily-action-instances';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();
    const row = await readProgramRow(admin, auth.user.id);

    return NextResponse.json({
      program_state: row?.program_state ?? null,
      proposal: row?.pending_ai_proposal ?? null,
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
    const row = await readProgramRow(admin, auth.user.id);
    const proposal = row?.pending_ai_proposal ?? null;

    // idempotency — אם אין הצעה / id לא תואם, התייחס כבר-טופל (200, no-op).
    if (!proposal || proposal.id !== proposalId) {
      return NextResponse.json({ ok: true, already_resolved: true });
    }

    // ניקוי ההצעה תמיד — היא נענתה.
    await writePendingProposal(admin, auth.user.id, null);

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
      // 🔁 The Override Mutation — צעד-המיקרו הופך ל"משימה של היום" עם מחזור-חיים.
      await applyPivotOverride(admin, auth.user.id, {
        displayTitle: proposal.next_step.title,
        originalTitle: proposal.next_step.restore_to ?? null,
        proposalId: proposal.id,
      }).catch((err) => console.error('[program/proposal] pivot override failed', err));
    }

    return NextResponse.json({ ok: true, decision, kind: proposal.kind });
  } catch (error) {
    console.error('[API /v1/ai/program/proposal POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
