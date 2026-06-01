import { NextResponse } from 'next/server';

export const runtime = 'edge';
import { z } from 'zod';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../lib/validation/zod-http';
import {
  nextCursorFromRows,
  parseInboxSearchParams,
} from '../../../../lib/notifications/inbox-params';

const patchSchema = z
  .object({
    id: z.string().uuid().optional(),
    mark_all: z.boolean().optional(),
    archive_id: z.string().uuid().optional(),
    unarchive_id: z.string().uuid().optional(),
  })
  .refine(
    (d) => {
      const actions = [
        d.mark_all === true,
        Boolean(d.id),
        Boolean(d.archive_id),
        Boolean(d.unarchive_id),
      ].filter(Boolean);
      return actions.length === 1;
    },
    { message: 'Provide exactly one of: mark_all (true), id, archive_id, unarchive_id' }
  );

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const url = new URL(request.url);
    const p = parseInboxSearchParams(url.searchParams);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('notifications')
      .select(
        'id, title, body, icon_emoji, action_url, is_read, created_at, type, archived_at, metadata'
      )
      .eq('user_id', user.id);

    if (p.archived) {
      q = q.not('archived_at', 'is', null);
    } else {
      q = q.is('archived_at', null);
    }

    if (p.unreadOnly) {
      q = q.eq('is_read', false);
    }

    if (p.types && p.types.length > 0) {
      q = q.in('type', p.types);
    }

    if (p.cursor) {
      q = q.lt('created_at', p.cursor);
    }

    q = q.order('created_at', { ascending: false }).limit(p.limit);

    /** עימוד (cursor): ללא COUNT מלא — חוסך טעינה על טבלאות גדולות */
    const includeUnreadTotal = !p.cursor;

    const countPromise = includeUnreadTotal
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('archived_at', null)
          .eq('is_read', false)
      : Promise.resolve({ count: null as number | null, error: null });

    const [{ data, error }, countResult] = await Promise.all([q, countPromise]);

    if (error) {
      console.error('[notifications GET] supabase error', error);
      return NextResponse.json(
        {
          error: 'Failed to load notifications',
          ...(process.env.NODE_ENV !== 'production'
            ? {
                debug: {
                  message: error.message,
                  code: (error as { code?: string }).code,
                  hint: (error as { hint?: string }).hint,
                  details: (error as { details?: string }).details,
                },
              }
            : {}),
        },
        { status: 500 }
      );
    }

    if (countResult?.error) {
      console.error('[notifications GET] count error', countResult.error);
      return NextResponse.json(
        { error: 'Failed to load notifications' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const next_cursor = nextCursorFromRows(
      rows.map((r) => ({ created_at: String(r.created_at ?? '') })),
      p.limit
    );

    const unread_total =
      includeUnreadTotal && typeof countResult?.count === 'number' ? countResult.count : undefined;

    return NextResponse.json({
      notifications: data ?? [],
      next_cursor,
      limit: p.limit,
      ...(unread_total !== undefined ? { unread_total } : {}),
    });
  } catch (error) {
    console.error('[notifications GET] unexpected', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && error instanceof Error
          ? { debug: { message: error.message, stack: error.stack } }
          : {}),
      },
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

    const parsed = patchSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error, 'Invalid body');

    const { supabase, user } = auth;
    const d = parsed.data;
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = () => (supabase as any).from('notifications');

    /** עוטף תגובת שגיאה גנרית עם לוג פנימי, בלי לחשוף message ל-prod. */
    const errorResponse = (tag: string, err: unknown, status = 500) => {
      console.error(`[notifications PATCH] ${tag}`, err);
      return NextResponse.json(
        {
          error: 'Failed to update notification',
          ...(process.env.NODE_ENV !== 'production' && err && typeof err === 'object'
            ? { debug: err }
            : {}),
        },
        { status }
      );
    };

    if (d.mark_all === true) {
      const { error } = await tbl()
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .is('archived_at', null);

      if (error) return errorResponse('mark_all', error);
      return NextResponse.json({ ok: true });
    }

    if (d.archive_id) {
      const { error } = await tbl()
        .update({ archived_at: now })
        .eq('user_id', user.id)
        .eq('id', d.archive_id);

      if (error) return errorResponse('archive_id', error);
      return NextResponse.json({ ok: true });
    }

    if (d.unarchive_id) {
      const { error } = await tbl()
        .update({ archived_at: null })
        .eq('user_id', user.id)
        .eq('id', d.unarchive_id);

      if (error) return errorResponse('unarchive_id', error);
      return NextResponse.json({ ok: true });
    }

    if (d.id) {
      const { error } = await tbl()
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('id', d.id);

      if (error) return errorResponse('mark_read', error);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  } catch (error) {
    console.error('[notifications PATCH] unexpected', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && error instanceof Error
          ? { debug: { message: error.message, stack: error.stack } }
          : {}),
      },
      { status: 500 }
    );
  }
}
