import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicAppBaseNoSlashFromServer } from '@/lib/public-app-url';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { createDemoAccessSchema } from '@/lib/demo-access/validation';
import { generateDemoAccessToken, hashDemoAccessToken } from '@/lib/demo-access/token';
import { hashDemoPassword } from '@/lib/demo-access/password';

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
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', parsed.data.target_user_id)
    .maybeSingle();

  if (!targetProfile) {
    return NextResponse.json({ error: 'משתמש היעד לא נמצא.' }, { status: 404 });
  }

  // אזהרה רכה: מותר גם admin — RLS + עוגיית דמו חוסמים הרשאות מנהל בזמן הסשן.
  const { data: au } = await admin.auth.admin.getUserById(parsed.data.target_user_id);
  if (!au?.user?.email) {
    return NextResponse.json({ error: 'למשתמש היעד אין אימייל מאומת במערכת.' }, { status: 400 });
  }

  const rawToken = generateDemoAccessToken();
  const tokenHash = hashDemoAccessToken(rawToken);
  const expiresAt = new Date(Date.now() + parsed.data.ttl_minutes * 60_000).toISOString();
  const passwordHash =
    parsed.data.password && parsed.data.password.trim().length >= 4
      ? hashDemoPassword(parsed.data.password.trim())
      : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('demo_access_links')
    .insert({
      token_hash: tokenHash,
      target_user_id: parsed.data.target_user_id,
      guest_name: parsed.data.guest_name?.trim() || null,
      reason: parsed.data.reason.trim(),
      password_hash: passwordHash,
      expires_at: expiresAt,
      created_by: auth.user.id,
      max_claims: parsed.data.max_claims ?? null,
    })
    .select('id, expires_at, guest_name, reason')
    .single();

  if (error || !inserted) {
    console.error('[demo-access] insert', error?.message);
    return NextResponse.json({ error: error?.message ?? 'יצירת קישור נכשלה.' }, { status: 500 });
  }

  const appBase = await publicAppBaseNoSlashFromServer(admin);
  const demoUrl = `${appBase}/demo/${rawToken}`;

  return NextResponse.json({
    id: inserted.id,
    demo_url: demoUrl,
    expires_at: inserted.expires_at,
    guest_name: inserted.guest_name,
    reason: inserted.reason,
    target_role: targetProfile.role,
    target_name: targetProfile.full_name,
    requires_password: Boolean(passwordHash),
    admin_target_note:
      targetProfile.role === 'admin'
        ? 'משתמש היעד הוא מנהל — בזמן סשן הדמו הרשאות המנהל חסומות (גם ב-RLS).'
        : null,
  });
}
