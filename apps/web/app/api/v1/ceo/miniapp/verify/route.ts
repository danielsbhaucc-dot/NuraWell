import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyStepup } from '@/lib/ceo/security';
import { decideAction } from '@/lib/ceo/actions';
import { allowedChatIds } from '@/lib/ceo/channel';
import { alertOwner, limitIp, noStore, resolveBotToken } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ t: z.string().max(100), initData: z.string().max(4096), deviceId: z.string().max(64), secret: z.string().max(128) });

export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-miniapp-ver', 20);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, ...noStore });
  const { t, ...body } = p.data;
  const db = createAdminClient();
  const v = await verifyStepup(db, t, body, await resolveBotToken(), allowedChatIds(), alertOwner);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 403, ...noStore });
  if (v.purpose === 'approve' && v.actionId) {
    const r = await decideAction(db, v.actionId, true, 'admin:faceid', { stepupVerified: true });
    await alertOwner(r.text, 'reply'); // result of Daniel's own Face ID approval
    return NextResponse.json({ ok: r.ok, text: r.ok ? 'בוצע.' : 'לא הצלחתי לבצע.' }, noStore);
  }
  const text = { unlock: 'גדעון שוחרר ופעיל.', settings: 'ההגדרות נשמרו.', remove_key: 'המכשיר הוסר.' }[v.purpose as 'unlock'] ?? 'אומת.';
  await alertOwner(`🔐 ${text}`, 'reply');
  return NextResponse.json({ ok: true, text }, noStore);
}
