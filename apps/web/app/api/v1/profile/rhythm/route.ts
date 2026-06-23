import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { mealTimesFromStrings } from '../../../../../lib/journey/profile-schedule';
import { jsonZodError } from '../../../../../lib/validation/zod-http';

export const runtime = 'edge';

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'שעה בפורמט HH:MM');

const patchSchema = z.object({
  wake_up_time: hhmm.optional().nullable(),
  sleep_time: hhmm.optional().nullable(),
  meal_count: z.number().int().min(0).max(4).optional().nullable(),
  meal_times: z.array(hhmm).max(4).optional(),
});

function normalizeHhmm(raw: string): string {
  const [h, m] = raw.split(':');
  return `${h!.padStart(2, '0')}:${m}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await auth.supabase
      .from('profiles')
      .select('wake_up_time, sleep_time, meal_count, meal_schedule')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (error) throw error;

    const meals = Array.isArray(row?.meal_schedule)
      ? (row.meal_schedule as Array<{ time?: string }>).map((m) =>
          String(m.time ?? '').slice(0, 5)
        )
      : [];

    return NextResponse.json({
      wake_up_time: row?.wake_up_time ? String(row.wake_up_time).slice(0, 5) : null,
      sleep_time: row?.sleep_time ? String(row.sleep_time).slice(0, 5) : null,
      meal_count: typeof row?.meal_count === 'number' ? row.meal_count : meals.length || 0,
      meal_times: meals,
    });
  } catch (e) {
    console.error('[API /v1/profile/rhythm GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = patchSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.wake_up_time !== undefined) {
      patch.wake_up_time = parsed.data.wake_up_time
        ? normalizeHhmm(parsed.data.wake_up_time)
        : null;
    }
    if (parsed.data.sleep_time !== undefined) {
      patch.sleep_time = parsed.data.sleep_time ? normalizeHhmm(parsed.data.sleep_time) : null;
    }
    if (parsed.data.meal_count !== undefined) {
      patch.meal_count = parsed.data.meal_count;
    }
    if (parsed.data.meal_times) {
      const count = parsed.data.meal_count ?? parsed.data.meal_times.length;
      const times = parsed.data.meal_times.slice(0, Math.max(0, count ?? 0));
      patch.meal_schedule = times.length ? mealTimesFromStrings(times) : null;
      if (parsed.data.meal_count === undefined) {
        patch.meal_count = times.length;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (auth.supabase.from('profiles') as any)
      .update(patch)
      .eq('id', auth.user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[API /v1/profile/rhythm PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
