import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { sendKickoffNudgeForUser } from '../../../../../lib/workflows/almog-onboarding-kickoff';
import {
  markKickoffFailed,
  markKickoffSent,
} from '../../../../../lib/auth/kickoff-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — דוח אבחון: מי קיבל kickoff, מי תקוע, ועל מה.
 * הרשאה: רק admin (לפי profiles.role).
 *
 * Query params:
 *   - state=pending|scheduled|sent|failed|skipped (אופציונלי, default: הכל)
 *   - limit=100 (אופציונלי, max 500)
 */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await (admin as any)
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'admins only' }, { status: 403 });
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 100));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('almog_kickoff_status')
    .select(
      `
      user_id,
      state,
      attempts,
      scheduled_at,
      last_attempt_at,
      sent_at,
      last_error,
      skip_reason,
      source,
      created_at,
      updated_at,
      profiles:profiles(full_name, onboarding_completed, created_at, last_active_at)
    `
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (state) query = query.eq('state', state);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /** סטטיסטיקות גלובליות */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: counts } = await (admin as any).rpc('almog_kickoff_state_counts').single();

  return NextResponse.json({
    ok: true,
    rows: data ?? [],
    stats: counts ?? null,
  });
}

/**
 * POST — שליחה ידנית של kickoff למשתמש (admin force-send).
 * Body: { userId: string }
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await (admin as any)
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'admins only' }, { status: 403 });
  }

  let body: { userId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const result = await sendKickoffNudgeForUser(admin, body.userId);
  if (result.inserted) {
    await markKickoffSent(admin, body.userId);
    return NextResponse.json({ ok: true, sent: true });
  }
  await markKickoffFailed(admin, body.userId, result.reason ?? 'unknown');
  return NextResponse.json({ ok: false, reason: result.reason ?? 'unknown' }, { status: 500 });
}
