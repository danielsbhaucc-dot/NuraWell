import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { killDeadDemoAuthSessions, revokeDemoSessionsForLink } from '@/lib/demo-access/claim';
import { deleteImageFromR2 } from '@/lib/cdn/public-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const idSchema = z.string().uuid();

const patchSchema = z.object({
  action: z.enum(['revoke', 'disconnect_sessions']),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 60, windowSeconds: 60 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'פעולה לא תקינה' }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (admin as any)
    .from('demo_access_links')
    .select('id, session_epoch, revoked_at')
    .eq('id', id)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'קישור לא נמצא' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  if (parsed.data.action === 'revoke') {
    await revokeDemoSessionsForLink(id);
    return NextResponse.json({ ok: true, revoked: true });
  }

  // disconnect_sessions — מנתק סשנים פעילים בלי לבטל את הקישור (אפשר להיכנס שוב)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_sessions')
    .update({ revoked_at: nowIso })
    .eq('link_id', id)
    .is('revoked_at', null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_links')
    .update({
      session_epoch: Number(link.session_epoch) + 1,
      updated_at: nowIso,
    })
    .eq('id', id);
  await killDeadDemoAuthSessions(id);

  return NextResponse.json({ ok: true, disconnected: true });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 40, windowSeconds: 60 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (admin as any)
    .from('demo_access_links')
    .select('id, welcome_image_key')
    .eq('id', id)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'קישור לא נמצא' }, { status: 404 });
  }

  await revokeDemoSessionsForLink(id);

  if (link.welcome_image_key) {
    try {
      await deleteImageFromR2(link.welcome_image_key);
    } catch {
      /* ignore storage cleanup failures */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('demo_access_links').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
