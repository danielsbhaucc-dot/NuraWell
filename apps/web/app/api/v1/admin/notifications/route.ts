import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist/i.test(error.message ?? '');
}

async function rateLimitAdmin(userId: string) {
  return consumeMultiRateLimits(userId, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
}

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await rateLimitAdmin(auth.user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 100);

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('ops_admin_notifications')
    .select('id, type, title, body, icon_emoji, action_url, is_read, metadata, created_at')
    .eq('admin_user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ notifications: [], unread_count: 0, migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notifications = data ?? [];
  const { count: unreadTotal } = await admin
    .from('ops_admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', auth.user.id)
    .eq('is_read', false);

  return NextResponse.json({
    notifications,
    unread_count: unreadTotal ?? notifications.filter((n) => !n.is_read).length,
  });
}

const patchSchema = z
  .object({
    notificationIds: z.array(z.string().uuid()).optional(),
    markAllRead: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await rateLimitAdmin(auth.user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  if (parsed.data.markAllRead) {
    const { error } = await admin
      .from('ops_admin_notifications')
      .update({ is_read: true })
      .eq('admin_user_id', auth.user.id)
      .eq('is_read', false);

    if (error && !isMissingRelationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const ids = parsed.data.notificationIds ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no_ids' }, { status: 400 });
  }

  const { error } = await admin
    .from('ops_admin_notifications')
    .update({ is_read: true })
    .eq('admin_user_id', auth.user.id)
    .in('id', ids);

  if (error && !isMissingRelationError(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
