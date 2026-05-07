import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      lesson_id: string;
      is_completed?: boolean;
      task_progress?: Record<string, boolean>;
      habit_progress?: Record<string, boolean[]>;
      time_spent_seconds?: number;
    };

    const { lesson_id, is_completed, task_progress, habit_progress, time_spent_seconds } = body;

    if (!lesson_id) {
      return NextResponse.json({ error: 'lesson_id is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('lesson_progress')
      .select('id, task_progress, habit_progress, time_spent_seconds')
      .eq('user_id', user.id)
      .eq('lesson_id', lesson_id)
      .maybeSingle();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (is_completed !== undefined) updateData.is_completed = is_completed;
    if (task_progress !== undefined) updateData.task_progress = task_progress;
    if (habit_progress !== undefined) updateData.habit_progress = habit_progress;
    if (time_spent_seconds !== undefined) {
      const prev = (existing as { time_spent_seconds?: number } | null)?.time_spent_seconds ?? 0;
      updateData.time_spent_seconds = prev + time_spent_seconds;
    }

    if (existing) {
      const { error } = await (supabase
        .from('lesson_progress') as ReturnType<typeof supabase.from>)
        .update(updateData as Parameters<ReturnType<typeof supabase.from>['update']>[0])
        .eq('user_id', user.id)
        .eq('lesson_id', lesson_id);

      if (error) throw error;
    } else {
      const insertData = {
        user_id: user.id,
        lesson_id,
        is_completed: is_completed ?? false,
        task_progress: task_progress ?? {},
        habit_progress: habit_progress ?? {},
        time_spent_seconds: time_spent_seconds ?? 0,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('lesson_progress') as any).insert(insertData);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /progress POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get('lesson_id');
    const courseId = searchParams.get('course_id');

    let query = supabase
      .from('lesson_progress')
      .select('lesson_id, is_completed, task_progress, habit_progress, time_spent_seconds')
      .eq('user_id', user.id);

    if (lessonId) query = query.eq('lesson_id', lessonId);
    if (courseId) {
      const { data: lessonIds } = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', courseId);
      const ids = (lessonIds as { id: string }[] | null)?.map(l => l.id) || [];
      if (ids.length > 0) query = query.in('lesson_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API /progress GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
