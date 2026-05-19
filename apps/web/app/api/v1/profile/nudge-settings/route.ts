import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { parseCoachingStyle, type AlmogCoachingStyle } from '../../../../../lib/ai/almog-coaching-style';
import { updateAiContext } from '../../../../../lib/ai/memory';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../../lib/validation/zod-http';

export const runtime = 'edge';

const hhmm = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'שעה בפורמט HH:MM')
  .optional()
  .nullable();

const bodySchema = z.object({
  avoid_push: z.boolean(),
  weight_reminders: z.boolean(),
  coaching_style: z.enum(['warm_friend', 'direct', 'gentle']).optional(),
  /** שעת הגעה לעבודה — לעיגון הודעות (למשל 09:00 → מגע ~08:30–08:55) */
  work_arrival_time: hhmm,
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = bodySchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { avoid_push, weight_reminders, coaching_style, work_arrival_time } = parsed.data;

    const patch: Parameters<typeof updateAiContext>[2] = {
      avoid_push,
      skip_weight_check_ins: !weight_reminders,
    };

    if (coaching_style != null) {
      patch.coaching_style = parseCoachingStyle(coaching_style) satisfies AlmogCoachingStyle;
    }

    if (work_arrival_time !== undefined) {
      const t = work_arrival_time?.trim();
      if (t) {
        const [h, m] = t.split(':');
        patch.work_arrival_time = `${h!.padStart(2, '0')}:${m}`;
      } else {
        patch.work_arrival_time = '';
      }
    }

    await updateAiContext(auth.supabase, auth.user.id, patch);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[API /v1/profile/nudge-settings]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
