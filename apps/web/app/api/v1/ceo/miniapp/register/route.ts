import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmDevice, registerDevice } from '@/lib/ceo/security';
import { allowedChatIds } from '@/lib/ceo/channel';
import { alertOwner, limitIp, noStore, resolveBotToken } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ t: z.string().max(100), initData: z.string().max(4096), label: z.string().max(60).default('טלפון') });
const Confirm = z.object({ confirm: z.literal(true), initData: z.string().max(4096), deviceId: z.string().max(64), secret: z.string().max(128) });

export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-miniapp-reg', 10);
  if (limited) return limited;
  const raw = await request.json().catch(() => null);
  const c = Confirm.safeParse(raw);
  if (c.success) {
    const ok = await confirmDevice(createAdminClient(), c.data.initData, await resolveBotToken(), allowedChatIds(), c.data.deviceId, c.data.secret);
    if (ok) await alertOwner('🔐 Face ID נרשם לגדעון במכשיר הזה. מכשירים קודמים (אם היו) הוסרו.');
    return NextResponse.json({ ok }, { status: ok ? 200 : 403, ...noStore });
  }
  const p = Body.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, ...noStore });
  const r = await registerDevice(createAdminClient(), p.data.t, p.data.initData, await resolveBotToken(), allowedChatIds(), p.data.label);
  if (!r.ok) return NextResponse.json(r, { status: 403, ...noStore });
  return NextResponse.json(r, noStore);
}
