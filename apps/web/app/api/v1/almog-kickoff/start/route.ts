import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { scheduleAlmogKickoff } from '../../../../../lib/auth/schedule-almog-kickoff';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import {
  checkKickoffEligibility,
  sendKickoffNudgeForUser,
} from '../../../../../lib/workflows/almog-onboarding-kickoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** רק עם CRON_SECRET — לאפשר טריגר עבור משתמש אחר ולא רק עצמך. */
  userId: z.string().uuid().optional(),
  /** מצב סנכרוני — שולח kickoff מיד ללא Workflow (לדיבוג). */
  immediate: z.boolean().optional(),
  /** דרק זמן השהיה (לדוגמה 2m לבדיקות). */
  delayString: z
    .string()
    .min(2)
    .regex(/^\d+[smhd]$/)
    .optional(),
});

/**
 * טריגר ידני לפנייה הראשונה של אלמוג.
 *
 * אופציות הזדהות:
 *   - Authorization: Bearer <CRON_SECRET>  → דורש userId מפורש בגוף הבקשה.
 *   - סשן משתמש מחובר                    → שולח לעצמו, מתעלם מ-userId שהועבר.
 *
 * אופציית הפעלה:
 *   - { immediate: true }  → מריץ סנכרונית (בודק זכאות + שולח עכשיו ללא Upstash sleep).
 *                            שימושי לבדיקה ידנית; עוקף את ה-9-22 window.
 *   - אחרת — מתזמן workflow רגיל (90m default או delayString).
 */
export async function POST(request: Request) {
  const raw = await readJsonBody(request);
  const body = raw.ok ? bodySchema.safeParse(raw.value) : null;
  if (raw.ok && body && !body.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: body.error.flatten() },
      { status: 400 }
    );
  }
  const parsed = body && body.success ? body.data : ({} as z.infer<typeof bodySchema>);

  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization');
  const isBearer = Boolean(secret && authHeader === `Bearer ${secret}`);

  let userId: string;
  if (isBearer) {
    if (!parsed.userId) {
      return NextResponse.json(
        { error: 'Bearer mode requires userId in body' },
        { status: 400 }
      );
    }
    userId = parsed.userId;
  } else {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    userId = session.user.id;
  }

  if (parsed.immediate) {
    const admin = createAdminClient();
    const eligibility = await checkKickoffEligibility(admin, userId);
    if (!eligibility.ok) {
      return NextResponse.json({
        ok: false,
        mode: 'immediate',
        userId,
        eligibility,
      });
    }
    const result = await sendKickoffNudgeForUser(admin, userId);
    return NextResponse.json({
      ok: result.inserted,
      mode: 'immediate',
      userId,
      deferred: eligibility.deferUntilIso,
      ...(result.inserted ? {} : { reason: result.reason }),
    });
  }

  const scheduled = await scheduleAlmogKickoff(userId, {
    delayString: parsed.delayString,
  });

  if (!scheduled.ok) {
    return NextResponse.json(
      { ok: false, reason: scheduled.reason, userId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    userId,
    workflowRunId: scheduled.workflowRunId,
    delayString: parsed.delayString ?? process.env.ALMOG_KICKOFF_DELAY ?? '90m',
  });
}
