import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '../../../../../lib/api/rate-limit';
import {
  applyDiscreteField,
  discreteFieldAck,
  type DiscreteFieldKey,
} from '../../../../../lib/ai/onboarding-discrete-fields';
import {
  buildFieldFlags,
  redactExtractedForClient,
} from '../../../../../lib/profile/extracted-field-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  key: z.enum(['full_name', 'current_weight_kg', 'goal_weight_kg', 'wake_up_time', 'sleep_time']),
  envelope: z.object({
    mode: z.literal('tls-v1'),
    value: z.string().min(1).max(200),
  }),
  /** דגלים קיימים מהלקוח — בלי ערכים רגישים */
  field_flags: z.record(z.boolean()).optional(),
});

function extractedToProfilePatch(key: DiscreteFieldKey, value: string | number): Record<string, unknown> {
  if (key === 'full_name') return { full_name: value };
  if (key === 'current_weight_kg' || key === 'goal_weight_kg') return { [key]: value };
  if (key === 'wake_up_time' || key === 'sleep_time') return { [key]: value };
  return {};
}

/**
 * קבלת שדה רגיש — לא עובר דרך מודל שפה, לא נרשם בלוגים.
 * שומר ישירות ל-profiles (עדכון חלקי). ההעברה מוגנת ב-HTTPS.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'profile-private-field', [
    { limit: 30, windowSeconds: 60 },
    { limit: 120, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { key, envelope } = parsed.data;
  const plaintext = envelope.value;

  const applied = applyDiscreteField({}, key as DiscreteFieldKey, plaintext);
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error }, { status: 400 });
  }

  const patch = extractedToProfilePatch(key as DiscreteFieldKey, applied.extracted[key] as string | number);
  const { error } = await auth.supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id);

  if (error) {
    console.error('[profile/private-field] save failed for key', key);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  const flags = {
    ...(parsed.data.field_flags ?? {}),
    ...Object.fromEntries(
      Object.entries(buildFieldFlags(applied.extracted)).map(([k, v]) => [k, v])
    ),
  };

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('gender')
    .eq('id', auth.user.id)
    .maybeSingle();

  const gender = profile?.gender === 'male' || profile?.gender === 'female' ? profile.gender : null;

  return NextResponse.json(
    {
      ok: true,
      key,
      field_flags: flags,
      extracted_public: redactExtractedForClient(applied.extracted),
      reply: discreteFieldAck(key as DiscreteFieldKey, gender),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
