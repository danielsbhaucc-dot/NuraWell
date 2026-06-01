import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { sendTaskCompletionCelebration } from '../../../../lib/ai/send-task-completion-celebration';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const slotRe =
  /^(?:full_day|morning|noon|evening|meal_breakfast|meal_lunch|meal_dinner|slot_[1-6])$/;

const bodySchema = z.object({
  step_id: z.string().uuid(),
  task_id: z.string().min(1).max(200),
  /** סלוט ספציפי שזה עתה סומן — מאפשר חגיגה פר-סלוט, לא רק על "הכל סגור". */
  slot: z.string().regex(slotRe).optional(),
  /** completed (ברירת מחדל) או attempt_failed → מסר תמיכה. */
  outcome: z.enum(['completed', 'attempt_failed']).optional(),
  /** המשתמש סימן סלוט שכבר היה מסומן — חיזוק עדין. */
  was_already_done: z.boolean().optional(),
});

/**
 * אחרי סימון "ביצעתי" / "ניסיתי ונכשלתי" — נוטיפיקציה מיידית מאלמוג עם
 * סטריק דטרמיניסטי. ראה `sendTaskCompletionCelebration`.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    const result = await sendTaskCompletionCelebration(admin, {
      userId: auth.user.id,
      stepId: parsed.data.step_id,
      taskId: parsed.data.task_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slot: parsed.data.slot as any,
      outcome: parsed.data.outcome,
      wasAlreadyDone: parsed.data.was_already_done,
    });

    if (result.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'recent_duplicate' });
    }

    if (result.title) {
      const { afterAlmogInAppNotification } = await import(
        '../../../../lib/notifications/after-almog-insert'
      );
      afterAlmogInAppNotification(auth.user.id, result.title, result.body);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('not in completed')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[almog-task-celebration]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
