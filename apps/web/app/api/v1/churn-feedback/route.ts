import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../lib/validation/zod-http';
import { CHURN_REASONS, type ChurnReason } from '../../../../lib/churn/reengagement-moves';
import { readReengagementContext } from '../../../../lib/churn/patch-reengagement-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  notificationId: z.string().uuid(),
  reason: z.enum(CHURN_REASONS as unknown as [ChurnReason, ...ChurnReason[]]),
  detail: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/churn-feedback — שמירת תשובת Exit Survey (ספק פרק 7).
 *
 * זרימה:
 *  1. אימות session.
 *  2. ולידציה + ודא שההתראה שייכת למשתמש ויש לה survey.
 *  3. Insert ל-churn_feedback (RLS: auth.uid() = user_id).
 *  4. עדכון notifications.metadata.survey.responded = true.
 *  5. סימון ai_context.reengagement.exit_survey_answered_at.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error, 'גוף בקשה לא תקין');

  const { supabase, user } = auth;
  const { notificationId, reason, detail } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  /** 2) שליפת ההתראה — ודא בעלות + שיש survey. */
  const { data: notif, error: notifErr } = await sb
    .from('notifications')
    .select('id, user_id, metadata')
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (notifErr) {
    console.error('[churn-feedback] notif fetch error', notifErr);
    return NextResponse.json({ error: 'שגיאה בטעינת ההתראה' }, { status: 500 });
  }
  if (!notif) {
    return NextResponse.json({ error: 'ההתראה לא נמצאה' }, { status: 404 });
  }

  const metadata = (notif.metadata ?? {}) as Record<string, unknown>;
  const survey = metadata.survey as
    | { type?: string; responded?: boolean }
    | undefined;
  if (!survey || survey.type !== 'churn_exit') {
    return NextResponse.json({ error: 'להתראה זו אין סקר נטישה' }, { status: 400 });
  }
  if (survey.responded === true) {
    return NextResponse.json({ ok: true, already: true });
  }

  const daysSinceLastActive =
    typeof metadata.days_since_last_active === 'number'
      ? (metadata.days_since_last_active as number)
      : null;
  const engagementStatus =
    typeof metadata.engagement_status === 'string'
      ? (metadata.engagement_status as string)
      : null;

  /** 3) Insert ל-churn_feedback. */
  const { error: insertErr } = await sb.from('churn_feedback').insert({
    user_id: user.id,
    reason,
    detail: detail?.trim() || null,
    notification_id: notificationId,
    days_since_last_active: daysSinceLastActive,
    engagement_status: engagementStatus,
  });

  if (insertErr) {
    console.error('[churn-feedback] insert error', insertErr);
    return NextResponse.json({ error: 'שמירת המשוב נכשלה' }, { status: 500 });
  }

  /** 4) עדכון metadata.survey.responded = true. */
  const nextMetadata = {
    ...metadata,
    survey: { ...survey, responded: true, reason },
  };
  const { error: updateErr } = await sb
    .from('notifications')
    .update({ metadata: nextMetadata })
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (updateErr) {
    console.error('[churn-feedback] metadata update error', updateErr);
    /** המשוב כבר נשמר — לא מחזירים שגיאה קשה, רק לוג. */
  }

  /** 5) סימון ב-ai_context.reengagement שהמשתמש השיב לסקר היציאה. */
  try {
    const { data: prof } = await sb
      .from('profiles')
      .select('ai_context')
      .eq('id', user.id)
      .maybeSingle();
    const aiContext = (prof?.ai_context ?? {}) as Record<string, unknown>;
    const reng = readReengagementContext(aiContext);
    await sb
      .from('profiles')
      .update({
        ai_context: {
          ...aiContext,
          reengagement: { ...reng, exit_survey_answered_at: new Date().toISOString() },
        },
      })
      .eq('id', user.id);
  } catch (e) {
    console.warn('[churn-feedback] mark answered failed', e);
  }

  return NextResponse.json({ ok: true });
}
