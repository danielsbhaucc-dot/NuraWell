import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createStepupLink, killSwitch, recordFailure, securityState } from '@/lib/ceo/security';
import { consumeRecoveryCode } from '@/lib/ceo/recovery';
import { alertOwner } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const [state, { data: keys }, { count: recoveryLeft }] = await Promise.all([securityState(db), db.from('admin_passkeys').select('id, label, created_at, last_used_at').order('created_at'), db.from('admin_recovery_codes').select('id', { count: 'exact', head: true }).is('used_at', null)]);
  return NextResponse.json({ state, passkeys: keys ?? [], recovery_left: recoveryLeft ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register_link'), recovery_code: z.string().max(40).optional() }),
  z.object({ action: z.literal('recovery_codes') }),
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
    case 'register_link': {
      // first key: admin login is enough. More keys: an existing key (Face ID, also via phone QR) or a recovery code.
      const { data: keys } = await db.from('admin_passkeys').select('id').eq('user_id', auth.user.id).limit(1);
      if (!keys?.length) return NextResponse.json({ url: await createStepupLink(db, 'register', { userId: auth.user.id }) });
      if (p.data.recovery_code) {
        if (!(await consumeRecoveryCode(db, auth.user.id, p.data.recovery_code))) {
          await recordFailure(db, 'bad recovery code', alertOwner);
          return NextResponse.json({ error: 'קוד שחזור שגוי או משומש' }, { status: 403 });
        }
        await alertOwner('🔑 נעשה שימוש בקוד שחזור כדי להוסיף מפתח לגדעון. אם זה לא אתה, כבה את גדעון מ-Ops.');
        return NextResponse.json({ url: await createStepupLink(db, 'register', { userId: auth.user.id }) });
      }
      return NextResponse.json({ url: await createStepupLink(db, 'verify', { userId: auth.user.id, payload: { grant: 'register' } }) });
    }
    case 'recovery_codes':
      return NextResponse.json({ url: await createStepupLink(db, 'verify', { userId: auth.user.id, payload: { grant: 'recovery' } }) });
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
