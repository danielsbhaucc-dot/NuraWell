import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { updateAiContext } from '../../../../../lib/ai/memory';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../../lib/validation/zod-http';

export const runtime = 'edge';

const bodySchema = z.object({
  /** פחות התראות מעודדות מחוץ לצ'אט */
  avoid_push: z.boolean(),
  /** תזכורות לעדכון משקל (כשכבוי — לא שולחים check-in משקל ב-Cron) */
  weight_reminders: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = bodySchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { avoid_push, weight_reminders } = parsed.data;
    await updateAiContext(auth.supabase, auth.user.id, {
      avoid_push,
      skip_weight_check_ins: !weight_reminders,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[API /v1/profile/nudge-settings]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
