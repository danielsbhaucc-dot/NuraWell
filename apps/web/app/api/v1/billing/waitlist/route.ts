import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const Body = z.object({ plan: z.enum(['basic', 'whatsapp', 'premium', 'extra_minutes']), interval: z.enum(['monthly', 'annual']).default('monthly') });

/** Join the waitlist for a plan (no payment). Idempotent per user+plan. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const { error } = await createAdminClient()
    .from('plan_waitlist')
    .upsert({ user_id: auth.user.id, plan: p.data.plan, billing_interval: p.data.interval }, { onConflict: 'user_id,plan' });
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
