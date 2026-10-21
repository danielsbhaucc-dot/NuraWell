import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { bumpStyleRulesVersion } from '@/lib/notifications/quality-learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return { denied: auth.response };
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return { denied: rateLimitResponse(rl) };
  return { denied: null };
}

/** Rules + per-day rejection/edit metrics + latest anonymized examples. */
export async function GET(request: Request) {
  const g = await guard(request);
  if (g.denied) return g.denied;
  const admin = createAdminClient();
  const days = Math.min(90, Math.max(7, Number(new URL(request.url).searchParams.get('days') ?? 30) || 30));
  const [rules, meta, daily, recent] = await Promise.all([
    admin
      .from('notify_style_rules')
      .select('id, avoid, prefer, category, hits, active, auto_fix, reviewed, origin, updated_at')
      .eq('deleted', false)
      .order('active', { ascending: false })
      .order('hits', { ascending: false })
      .limit(100),
    admin.from('notify_style_rules_meta').select('version, updated_at').eq('id', 1).maybeSingle(),
    admin.rpc('notify_quality_daily', { p_days: days }),
    admin
      .from('notify_quality_events')
      .select('created_at, stage, category, before_text, after_text')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  const err = rules.error ?? daily.error ?? recent.error;
  if (err) return NextResponse.json({ error: 'שגיאה בטעינת הנתונים' }, { status: 500 });
  return NextResponse.json({ rules: rules.data, meta: meta.data, daily: daily.data, recent: recent.data });
}

/** Toggle a rule: { id, active?, auto_fix? }. Marks it reviewed so the nightly job won't override it. */
export async function PATCH(request: Request) {
  const g = await guard(request);
  if (g.denied) return g.denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown; active?: unknown; auto_fix?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const patch: Record<string, unknown> = { reviewed: true, updated_at: new Date().toISOString() };
  if (typeof body?.active === 'boolean') patch.active = body.active;
  if (typeof body?.auto_fix === 'boolean') patch.auto_fix = body.auto_fix;
  const admin = createAdminClient();
  const { error } = await admin.from('notify_style_rules').update(patch).eq('id', id).eq('deleted', false);
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 });
  const version = await bumpStyleRulesVersion(admin);
  return NextResponse.json({ ok: true, version });
}

/** Delete a rule (?id=): tombstoned so it is never re-learned. */
export async function DELETE(request: Request) {
  const g = await guard(request);
  if (g.denied) return g.denied;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from('notify_style_rules')
    .update({ deleted: true, active: false, auto_fix: false, reviewed: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 });
  const version = await bumpStyleRulesVersion(admin);
  return NextResponse.json({ ok: true, version });
}
