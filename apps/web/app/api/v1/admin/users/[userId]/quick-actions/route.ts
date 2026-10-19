import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOOL_BY_NAME } from '@/lib/ceo/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

/** Ops parity with Gideon: same tool implementations (pause notifications, send in-app notification). */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause'), days: z.number().int().min(0).max(60) }),
  z.object({ action: z.literal('notify'), title: z.string().min(2).max(80), body: z.string().min(2).max(400), action_url: z.string().max(200).default('/dashboard') }),
]);

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [{ limit: 30, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const tool = TOOL_BY_NAME.get(p.data.action === 'pause' ? 'pause_user_notifications' : 'send_user_notification')!;
  const args = p.data.action === 'pause' ? { userId, days: p.data.days } : { userId, title: p.data.title, body: p.data.body, action_url: p.data.action_url };
  try {
    await tool.run(createAdminClient(), tool.schema.parse(args));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[ops quick-actions]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'הפעולה נכשלה' }, { status: 500 });
  }
}
