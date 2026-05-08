import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseForApiRoute } from '../../../../lib/supabase/api-route-client';

const markSchema = z.object({
  id: z.string().uuid().optional(),
  mark_all: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const { supabase, user, authError } = await createSupabaseForApiRoute(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('notifications')
      .select('id, title, body, icon_emoji, action_url, is_read, created_at, type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notifications: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user, authError } = await createSupabaseForApiRoute(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = markSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, mark_all } = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any).from('notifications').update({ is_read: true }).eq('user_id', user.id);

    if (mark_all) {
      query = query.eq('is_read', false);
    } else if (id) {
      query = query.eq('id', id);
    } else {
      return NextResponse.json({ error: 'Provide id or mark_all=true' }, { status: 400 });
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
