import { NextResponse } from 'next/server';

import { markMicroWinHabitForUser } from '../../../../../lib/ai/micro-win-habit';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';

export const runtime = 'edge';

/**
 * POST — מסמן הרגל מים/יומי בצעד הפעיל (ניצחון זעיר מהצ'אט).
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (raw.ok && raw.value != null && typeof raw.value === 'object') {
    const body = raw.value as Record<string, unknown>;
    if (body.user_id && body.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const result = await markMicroWinHabitForUser(auth.supabase, auth.user.id);

  if (!result.ok) {
    const status = result.error === 'no_active_step' || result.error === 'no_habit' ? 404 : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    step_id: result.stepId,
    habit_id: result.habitId,
    habit_title: result.habitTitle,
  });
}
