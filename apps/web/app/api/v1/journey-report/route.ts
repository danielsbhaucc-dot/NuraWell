import { NextResponse } from 'next/server';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { jerusalemDateKey } from '../../../../lib/journey/task-schedule';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const JOURNEY_PROGRESS_SELECT =
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, habit_meta, task_level_meta, is_completed, completed_at, last_section';

/**
 * תמצית מסע + התקדמות — למסך דיווח מהיר (בלי לוגיקת admin).
 *
 *  - מחזיר גם `today_executions`: שורות של journey_task_executions של היום בלוח ירושלים.
 *  - מאפשר ל-UI להראות איזה סלוטים סומנו כבר היום, ולסמן מחדש מחר (איפוס יומי).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawSteps, error: sErr } = await supabase
      .from('journey_steps')
      .select('id, title, step_number, tasks, habits')
      .eq('is_published', true)
      .order('step_number');

    if (sErr) {
      return NextResponse.json({ error: 'Failed to load steps' }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawProg, error: pErr } = await supabase
      .from('journey_progress')
      .select(JOURNEY_PROGRESS_SELECT)
      .eq('user_id', user.id);

    if (pErr) {
      return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
    }

    const todayKey = jerusalemDateKey();
    const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const sinceKey = jerusalemDateKey(since);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawExec } = await supabase
      .from('journey_task_executions')
      .select('step_id, task_id, slot, completed_at, date_key, source, outcome')
      .eq('user_id', user.id)
      .eq('date_key', todayKey)
      .limit(500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawExecRecent } = await supabase
      .from('journey_task_executions')
      .select('step_id, task_id, slot, completed_at, date_key, source, outcome')
      .eq('user_id', user.id)
      .gte('date_key', sinceKey)
      .order('date_key', { ascending: false })
      .limit(800);

    const progByStep = new Map((rawProg ?? []).map((p: { step_id: string }) => [p.step_id, p]));

    return NextResponse.json({
      today_date_key: todayKey,
      steps: (rawSteps ?? []).map((s: { id: string }) => ({
        ...s,
        progress: progByStep.get(s.id) ?? null,
      })),
      today_executions: rawExec ?? [],
      recent_executions: rawExecRecent ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
