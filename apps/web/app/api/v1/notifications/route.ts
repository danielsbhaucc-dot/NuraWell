import { NextResponse } from 'next/server';

export const runtime = 'edge';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../lib/validation/zod-http';

const markSchema = z.object({
  id: z.string().uuid().optional(),
  mark_all: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;

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
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = markSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error, 'Invalid body');

    const { id, mark_all } = parsed.data;
    const { supabase, user } = auth;

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
