import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { changeTaskLevel } from '@/lib/tasks';

export const runtime = 'nodejs';

const schema = z.object({
  assignmentId: z.string().uuid(),
  direction: z.enum(['easier', 'harder']),
  reason: z.string().trim().max(500).optional(),
  source: z.enum(['user_button', 'sos', 'chat']).default('user_button'),
});

/** "קשה לי" / "גם זה קשה לי" / "קל לי" — one ladder step, owner only, recorded with reason. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await changeTaskLevel(createAdminClient(), {
    userId: auth.user.id,
    assignmentId: p.data.assignmentId,
    direction: p.data.direction,
    reason: p.data.reason || (p.data.direction === 'easier' ? 'המשתמש ביקש: קשה לי' : 'המשתמש ביקש: קל לי'),
    source: p.data.source,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
