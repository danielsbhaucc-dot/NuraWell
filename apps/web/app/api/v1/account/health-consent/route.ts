import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotDemoAccessSession } from '@/lib/demo-access/server';
import {
  getHealthConsentState,
  grantHealthConsent,
  withdrawHealthConsent,
} from '@/lib/privacy/health-consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('withdraw'), confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal('grant') }).strict(),
]);

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    const state = await getHealthConsentState(createAdminClient(), auth.user.id);
    // Legacy accounts without a record are NOT treated as consented; the app prompts them.
    return NextResponse.json({ active: state.granted === true, needs_prompt: state.granted === null, decided_at: state.at });
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת ההסכמה' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const demoGate = await assertNotDemoAccessSession(auth.user.id);
  if (!demoGate.ok) return NextResponse.json({ error: demoGate.message }, { status: 403 });

  const rl = await consumeMultiRateLimits(auth.user.id, 'health-consent', [{ limit: 6, windowSeconds: 3600 }]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });

  const admin = createAdminClient();
  if (parsed.data.action === 'withdraw') {
    const r = await withdrawHealthConsent(admin, auth.user.id, { source: 'settings_privacy' });
    if (!r.ok) return NextResponse.json({ error: 'הביטול נכשל, נסה שוב' }, { status: 500 });
    return NextResponse.json({ active: false, measurements_deleted: r.measurementsDeleted });
  }
  const r = await grantHealthConsent(admin, auth.user.id, { source: 'settings_privacy' });
  if (!r.ok) return NextResponse.json({ error: 'השמירה נכשלה, נסה שוב' }, { status: 500 });
  return NextResponse.json({ active: true });
}
