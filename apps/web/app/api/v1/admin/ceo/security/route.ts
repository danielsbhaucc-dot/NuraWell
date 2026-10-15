import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStepupLink, killSwitch, securityState } from '@/lib/ceo/security';
import { alertOwner } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const [state, { data: keys }] = await Promise.all([securityState(db), db.from('admin_passkeys').select('id, label, created_at, last_used_at').order('created_at')]);
  return NextResponse.json({ state, passkeys: keys ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register_link') }),
  z.object({ action: z.literal('unlock_link') }),
  z.object({ action: z.literal('kill'), reason: z.string().max(200).default('Ops') }),
  z.object({ action: z.literal('remove_key'), id: z.string().uuid() }),
  z.object({ action: z.literal('trust'), trust_minutes: z.number().int().min(0).max(24 * 60), reverify_minutes: z.number().int().min(0).max(14 * 24 * 60) }),
]);

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-ceo-sec', [{ limit: 20, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const db = createAdminClient();
  const actor = `ops:${auth.user.id}`; // eslint-disable-line @typescript-eslint/no-unused-vars
  switch (p.data.action) {
    case 'register_link':
      return NextResponse.json({ url: await createStepupLink(db, 'register', { userId: auth.user.id }) });
    case 'unlock_link':
      // turning Gideon back on / clearing lockout = admin session + passkey on the next page
      return NextResponse.json({ url: await createStepupLink(db, 'unlock', { userId: auth.user.id, next: '/ceo/security' }) });
    case 'kill':
      await killSwitch(db, actor, p.data.reason);
      await alertOwner('⛔ גדעון כובה מ-Ops. כל הפעולות הממתינות בוטלו.');
      return NextResponse.json({ ok: true });
    case 'trust':
      // security settings change only after Face ID
      return NextResponse.json({ url: await createStepupLink(db, 'settings', { userId: auth.user.id, payload: { trust_minutes: p.data.trust_minutes, reverify_minutes: p.data.reverify_minutes }, next: '/ceo/security' }) });
    case 'remove_key': {
      const { data: k } = await db.from('admin_passkeys').select('id, label').eq('id', p.data.id).maybeSingle();
      if (!k) return NextResponse.json({ error: 'המפתח לא נמצא' }, { status: 404 });
      return NextResponse.json({ url: await createStepupLink(db, 'remove_key', { userId: auth.user.id, payload: { keyId: k.id, label: k.label }, next: '/ceo/security' }) });
    }
  }
}
