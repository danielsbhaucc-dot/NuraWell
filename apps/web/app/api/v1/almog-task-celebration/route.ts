import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { sendTaskCompletionCelebration } from '../../../../lib/ai/send-task-completion-celebration';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  step_id: z.string().uuid(),
  task_id: z.string().min(1).max(200),
});

/**
 * אחרי סימון "ביצעתי" על משימה — נוטיפיקציה מיידית מאלמוג (AI מותאם לקלות/קושי משוער מהניסוח).
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
    const result = await sendTaskCompletionCelebration(
      admin,
      auth.user.id,
      parsed.data.step_id,
      parsed.data.task_id
    );

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
