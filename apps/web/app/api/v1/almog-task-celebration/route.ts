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

    /**
     * 🛡️ Ownership check: לפני שאנחנו עוברים ל-service-role (admin) ומפעילים
     * AI ויצירת התראה, נוודא שהמשתמש הנוכחי באמת בעל progress קיים על
     * ה-step_id שמועבר. הקריאה רצה תחת ה-Supabase client של ה-session
     * (RLS פעיל), כך שמשתמש לא יכול "לחגוג" step שלא שלו.
     *
     * אם הרשומה לא קיימת — זה גם מקרה לגיטימי כשמדובר ב-celebration על
     * step שעדיין לא נוצר ל-progress עבורו, אבל כדי להישאר בטוחים נדרש
     * שיהיה לפחות journey_progress פעיל אחד עם ה-step_id הזה.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownership, error: ownershipErr } = await (auth.supabase as any)
      .from('journey_progress')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('step_id', parsed.data.step_id)
      .limit(1)
      .maybeSingle();

    if (ownershipErr) {
      console.error('[almog-task-celebration] ownership lookup failed', ownershipErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    if (!ownership) {
      return NextResponse.json(
        { error: 'Forbidden — step not in user journey progress' },
        { status: 403 }
      );
    }

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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
