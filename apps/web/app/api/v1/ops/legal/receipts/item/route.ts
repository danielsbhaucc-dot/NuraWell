import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { markGmailConfirmationResolved, updateReceipt } from '@/lib/legal/media/receipts';
import { VENDORS } from '@/lib/legal/media/receipts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const d = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional();
const body = z.object({ id: z.string().uuid(), vendor: z.enum(Object.keys(VENDORS) as [string, ...string[]]).optional(), plan: z.string().max(120).nullable().optional(), period_start: d, period_end: d, trust: z.enum(['verified', 'review', 'rejected']).optional(), confirmed: z.literal(true).optional() }).strict();

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_input' }, { status: 400 });
  const { id, confirmed, ...patch } = p.data;
  if (confirmed) {
    const c = await markGmailConfirmationResolved(createAdminClient(), id, { by: 'admin', actor_id: auth.user.id });
    return NextResponse.json(c, { status: c.ok ? 200 : 500 });
  }
  const r = await updateReceipt(createAdminClient(), id, patch, auth.user.id);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
