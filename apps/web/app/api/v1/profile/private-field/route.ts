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
import {
  getProfileVaultPublicJwk,
  profileVaultEncryptionEnabled,
  resolvePrivateFieldPlaintext,
} from '../../../../../lib/profile/private-field-crypto-server';
import type { PrivateFieldTransportMode } from '../../../../../lib/profile/private-field-envelope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const envelopeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('ecdh-aes-gcm-v1'),
    ephemeral_public_key: z.record(z.unknown()),
    iv: z.string().min(8).max(32),
    ciphertext: z.string().min(8).max(8192),
  }),
  z.object({
    mode: z.literal('tls-v1'),
    value: z.string().min(1).max(200),
  }),
]);

const bodySchema = z.object({
  key: z.enum(['full_name', 'current_weight_kg', 'goal_weight_kg', 'wake_up_time', 'sleep_time']),
  envelope: envelopeSchema,
  /** דגלים קיימים מהלקוח — בלי ערכים רגישים */
  field_flags: z.record(z.boolean()).optional(),
});

function extractedToProfilePatch(key: DiscreteFieldKey, value: string | number): Record<string, unknown> {
  if (key === 'full_name') return { full_name: value };
  if (key === 'current_weight_kg' || key === 'goal_weight_kg') return { [key]: value };
  if (key === 'wake_up_time' || key === 'sleep_time') return { [key]: value };
  return {};
}

/** הגדרות ערוץ פרטי — מפתח ציבורי ל-ECDH (אם מוגדר) */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'profile-private-field', [
    { limit: 60, windowSeconds: 60 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const encrypted = profileVaultEncryptionEnabled();
  const mode: PrivateFieldTransportMode = encrypted ? 'ecdh-aes-gcm-v1' : 'tls-v1';
  const public_key = encrypted ? await getProfileVaultPublicJwk() : null;

  return NextResponse.json(
    {
      mode,
      public_key,
      curve: 'P-256',
      encryption_required: encrypted && process.env.NODE_ENV === 'production',
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

/**
 * קבלת שדה רגיש מוצפן — לא עובר דרך מודל שפה, לא נרשם בלוגים.
 * שומר ישירות ל-profiles (עדכון חלקי).
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

  const { key } = parsed.data;
  let plaintext: string;

  try {
    plaintext = await resolvePrivateFieldPlaintext(
      parsed.data.envelope as Parameters<typeof resolvePrivateFieldPlaintext>[0]
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'decrypt_failed';
    if (msg === 'ENCRYPTION_REQUIRED') {
      return NextResponse.json({ error: 'encryption_required' }, { status: 400 });
    }
    return NextResponse.json({ error: 'decrypt_failed' }, { status: 400 });
  }

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
