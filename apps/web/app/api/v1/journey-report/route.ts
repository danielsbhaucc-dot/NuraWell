import { NextResponse } from 'next/server';
import { requireApiSession } from '../../../../lib/api/route-guards';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * תמצית מסע + התקדמות — למסך דיווח מהיר (בלי לוגיקת admin).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawSteps, error: sErr } = await (supabase as any)
      .from('journey_steps')
      .select('id, title, step_number, tasks, habits')
      .eq('is_published', true)
      .order('step_number');

    if (sErr) {
      return NextResponse.json({ error: 'Failed to load steps' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawProg, error: pErr } = await (supabase as any)
      .from('journey_progress')
      .select('*')
      .eq('user_id', user.id);

    if (pErr) {
      return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
    }

    const progByStep = new Map((rawProg ?? []).map((p: { step_id: string }) => [p.step_id, p]));

    return NextResponse.json({
      steps: (rawSteps ?? []).map((s: { id: string }) => ({
        ...s,
        progress: progByStep.get(s.id) ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
