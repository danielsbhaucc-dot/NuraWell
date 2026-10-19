import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { readDemoDefaultTarget, writeDemoDefaultTarget } from '@/lib/demo-access/create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Default demo target account (also used by Gideon's create_demo_link). */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  return NextResponse.json({ default_target_user_id: await readDemoDefaultTarget(admin) });
}

const putSchema = z.object({ default_target_user_id: z.string().uuid().nullable() });

export async function PUT(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [{ limit: 30, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = putSchema.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const admin = createAdminClient();
  const id = parsed.data.default_target_user_id;
  if (id) {
    const { data } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
    if (!data) return NextResponse.json({ error: 'משתמש היעד לא נמצא.' }, { status: 404 });
  }
  const r = await writeDemoDefaultTarget(admin, id);
  if (!r.ok) {
    console.error('[demo-access] default target', r.error);
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ default_target_user_id: id });
}
