import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { approveDeviceRequest, createStepupLink, hasPasskey, killSwitch, requestDevice, securityState } from '@/lib/module-api/gideon/lib-ceo-security';
import { allowedChatIds } from '@/lib/module-api/gideon/lib-ceo-channel';
import { alertOwner, sendMiniAppButton } from '@/lib/module-api/gideon/lib-ceo-stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const [state, { data: keys }, { data: requests }] = await Promise.all([
    securityState(db),
    db.from('admin_passkeys').select('id, label, created_at, last_used_at, activated_at').order('created_at'),
    db.from('gideon_device_requests').select('id, replace, created_at').eq('status', 'pending').order('created_at', { ascending: false }),
  ]);
  const now = Date.now();
  return NextResponse.json(
    { state, devices: (keys ?? []).filter((k: { activated_at: string }) => Date.parse(k.activated_at) <= now), requests: requests ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve_device'), id: z.string().uuid() }),
  z.object({ action: z.literal('reject_device'), id: z.string().uuid() }),
  z.object({ action: z.literal('new_device'), replace: z.boolean().default(true) }),
  z.object({ action: z.literal('unlock') }),
  z.object({ action: z.literal('kill'), reason: z.string().max(200).default('Ops') }),
  z.object({ action: z.literal('remove_key'), id: z.string().uuid() }),
  z.object({ action: z.literal('trust'), trust_minutes: z.number().int().min(0).max(24 * 60), reverify_minutes: z.number().int().min(0).max(14 * 24 * 60) }),
]);

/** Owner chat = first allowlisted Telegram chat (Daniel). Face ID always happens there, never in the browser. */
const ownerChat = () => [...allowedChatIds()][0] ?? null;

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-ceo-sec', [{ limit: 20, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const db = createAdminClient();
  const chat = ownerChat();
  const sendFaceId = async (text: string, url: string) => {
    if (!chat) throw new Error('no owner chat');
    await sendMiniAppButton(chat, text, url);
    return NextResponse.json({ ok: true, sentToTelegram: true });
  };

  switch (p.data.action) {
    case 'approve_device':
    case 'new_device': {
      let id = p.data.action === 'approve_device' ? p.data.id : null;
      if (!id) {
        if (!chat) return NextResponse.json({ error: 'אין צ׳אט טלגרם מאומת' }, { status: 400 });
        id = (await requestDevice(db, chat, p.data.action === 'new_device' ? p.data.replace : false)).id;
      }
      const a = await approveDeviceRequest(db, id, auth.user.id);
      if (!a) return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 });
      await sendMiniAppButton(a.chatId, `אושר. לחץ כדי לרשום Face ID בטלפון הזה (תקף ל-10 דקות)${a.replace ? '. המכשירים הקודמים יוסרו אחרי הרישום' : ''}.`, a.url, '📱 רישום Face ID');
      return NextResponse.json({ ok: true, sentToTelegram: true });
    }
    case 'reject_device':
      await db.from('gideon_device_requests').update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: auth.user.id }).eq('id', p.data.id).eq('status', 'pending');
      await alertOwner('❌ בקשת רישום מכשיר לגדעון נדחתה בלוח הבקרה. אם לא ביקשת אותה, שקול כיבוי.');
      return NextResponse.json({ ok: true });
    case 'kill':
      await killSwitch(db, `ops:${auth.user.id}`, p.data.reason);
      await alertOwner('⛔ גדעון כובה מלוח הבקרה. כל הפעולות הממתינות בוטלו.');
      return NextResponse.json({ ok: true });
    case 'unlock':
      if (!(await hasPasskey(db))) {
        // no device yet → admin login is the only factor available
        await db.from('gideon_settings').upsert({ id: 1, disabled: false, disabled_reason: null, locked_until: null, failed_stepups: 0 }, { onConflict: 'id' });
        await alertOwner('🔓 גדעון שוחרר מלוח הבקרה.');
        return NextResponse.json({ ok: true });
      }
      return sendFaceId('🔓 שחרור גדעון והפעלה מחדש. אשר עם Face ID:', await createStepupLink(db, 'unlock', { userId: auth.user.id }));
    case 'remove_key': {
      const { data: k } = await db.from('admin_passkeys').select('id, label').eq('id', p.data.id).maybeSingle();
      if (!k) return NextResponse.json({ error: 'המכשיר לא נמצא' }, { status: 404 });
      return sendFaceId(`הסרת מכשיר "${k.label}". אשר עם Face ID:`, await createStepupLink(db, 'remove_key', { userId: auth.user.id, payload: { keyId: k.id, label: k.label } }));
    }
    case 'trust':
      if (!(await hasPasskey(db))) return NextResponse.json({ error: 'קודם צריך לרשום Face ID בטלגרם' }, { status: 409 });
      return sendFaceId('שינוי הגדרות האבטחה של גדעון. אשר עם Face ID:', await createStepupLink(db, 'settings', { userId: auth.user.id, payload: { trust_minutes: p.data.trust_minutes, reverify_minutes: p.data.reverify_minutes } }));
  }
}
