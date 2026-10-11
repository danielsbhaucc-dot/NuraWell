import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { respondToOffer } from '@/lib/tasks';

export const runtime = 'nodejs';

const schema = z.object({ definitionId: z.string().uuid(), accept: z.boolean() });

/** The user CHOOSES whether to take a task offered by a lesson/step. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const id = await respondToOffer(createAdminClient(), { userId: auth.user.id, ...p.data });
  return NextResponse.json({ ok: true, assignmentId: id });
}
