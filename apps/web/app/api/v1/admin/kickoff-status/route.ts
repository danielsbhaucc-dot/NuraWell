import { auditAdminRequest, requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { sendKickoffNudgeForUser } from '../../../../../lib/workflows/almog-onboarding-kickoff';
import {
  markKickoffFailed,
  markKickoffSent,
} from '../../../../../lib/auth/kickoff-status';
import { consumeMultiRateLimits, rateLimitResponse } from '../../../../../lib/api/rate-limit';

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
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await admin
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
  let query = admin
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
      updated_at
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
  const { data: counts } = await admin.rpc('almog_kickoff_state_counts').single();

  // profiles fetched top-level (not embedded) so enc:v2 columns like full_name are decrypted
  const baseRows = (data ?? []) as Array<{ user_id: string } & Record<string, unknown>>;
  const ids = [...new Set(baseRows.map((r) => r.user_id).filter(Boolean))];
  const profById = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, full_name, onboarding_completed, created_at, last_active_at')
      .in('id', ids);
    for (const p of (profs ?? []) as Array<{ id: string } & Record<string, unknown>>) {
      const { id, ...rest } = p;
      profById.set(id, rest);
    }
  }
  const rows = baseRows.map((r) => ({ ...r, profiles: profById.get(r.user_id) ?? null }));

  return NextResponse.json({
    ok: true,
    rows,
    stats: counts ?? null,
  });
}

/**
 * POST — שליחה ידנית של kickoff למשתמש (admin force-send).
 * Body: { userId: string }
 */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRow } = await admin
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'admins only' }, { status: 403 });
  }
  // audited centrally in requireApiAdmin

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

// Cap function time so a hung upstream call cannot burn active CPU for the 300s default.
export const maxDuration = 30;
