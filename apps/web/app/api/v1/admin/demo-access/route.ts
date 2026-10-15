import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { createDemoAccessSchema } from '@/lib/demo-access/validation';
import { createDemoAccessLink } from '@/lib/demo-access/create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  const { data, error } = await (admin as any)
    .from('demo_access_links')
    .select(
      `id, target_user_id, guest_name, reason, expires_at, revoked_at, created_by, created_at,
       first_claimed_at, last_claimed_at, claim_count, max_claims, session_epoch, welcome_image_key,
       updated_at, password_hash`,
    )
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const enriched = await Promise.all(
    rows.map(async (row: {
      id: string;
      target_user_id: string;
      password_hash: string | null;
      welcome_image_key: string | null;
      updated_at: string;
      [key: string]: unknown;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (admin as any)
        .from('profiles')
        .select('full_name, role')
        .eq('id', row.target_user_id)
        .maybeSingle();
      const { data: au } = await admin.auth.admin.getUserById(row.target_user_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (admin as any)
        .from('demo_access_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('link_id', row.id)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString());

      const { password_hash: _ph, ...rest } = row;
      return {
        ...rest,
        requires_password: Boolean(_ph),
        target_name: profile?.full_name ?? null,
        target_role: profile?.role ?? null,
        target_email: au?.user?.email ?? null,
        active_sessions: count ?? 0,
        welcome_image_url: row.welcome_image_key
          ? getPublicCdnImageUrl(row.welcome_image_key, String(new Date(row.updated_at).getTime()))
          : null,
      };
    }),
  );

  return NextResponse.json({ links: enriched });
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 40, windowSeconds: 60 },
    { limit: 200, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = createDemoAccessSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים ליצירת קישור דמו.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const r = await createDemoAccessLink(admin, { ...parsed.data, created_by: auth.user.id });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { ok: _ok, ...body } = r;
  return NextResponse.json({
    ...body,
    admin_target_note:
      r.target_role === 'admin'
        ? 'משתמש היעד הוא מנהל — בזמן סשן הדמו הרשאות המנהל חסומות (גם ב-RLS).'
        : null,
  });
}
