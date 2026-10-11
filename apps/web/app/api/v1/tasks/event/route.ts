import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordTaskEvent } from '@/lib/tasks';

export const runtime = 'nodejs';

const schema = z.object({
  assignmentId: z.string().uuid(),
  kind: z.enum(['done', 'partial', 'missed', 'skipped']),
  slot: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const r = await recordTaskEvent(createAdminClient(), { userId: auth.user.id, ...p.data, source: 'app' });
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
