import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotDemoAccessSession } from '@/lib/demo-access/server';
import { getHealthConsentState, grantHealthConsent, withdrawHealthConsent } from '@/lib/privacy/health-consent';
import { recordConsentEvidence, requestMeta } from '@/lib/legal/record-evidence';
import { consentText, normalizeGender, CONSENT_TEXT_VERSION } from '@/lib/legal/consent-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z
  .object({
    action: z.enum(['grant', 'withdraw']),
    text_version: z.string().max(40),
    typed_word: z.string().max(40),
    checkbox: z.literal(true),
    screenshot: z.string().max(820_000).nullable().optional(),
    screenshots: z.array(z.string().max(820_000)).max(6).optional(),
    source: z.enum(['settings_privacy', 'chat', 'prompt']).optional(),
    client: z.record(z.string(), z.union([z.string().max(64), z.number(), z.null()])).optional(),
  })
  .strict();

function jwtSessionId(token: string | undefined): string | null {
  try {
    const p = JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString('utf8')) as { session_id?: string };
    return typeof p.session_id === 'string' ? p.session_id : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    const admin = createAdminClient();
    const state = await getHealthConsentState(admin, auth.user.id);
    const { data: prof } = await admin.from('profiles').select('gender').eq('id', auth.user.id).maybeSingle();
    const gender = normalizeGender((prof as { gender?: string } | null)?.gender);
    // Legacy accounts without a record are NOT treated as consented; the app prompts them.
    return NextResponse.json(
      {
        active: state.granted === true,
        needs_prompt: state.granted === null,
        decided_at: state.at,
        gender,
        text_version: CONSENT_TEXT_VERSION,
        texts: { grant: consentText('grant', gender), withdraw: consentText('withdraw', gender) },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת ההסכמה' }, { status: 500 });
  }
}

const ERR: Record<string, string> = {
  stale_text_version: 'הנוסח התעדכן. נא לפתוח את החלון מחדש.',
  checkbox_required: 'צריך לסמן את תיבת האישור.',
  typed_word_invalid: 'המילה שהוקלדה לא תואמת.',
};

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
  const b = parsed.data;

  const admin = createAdminClient();
  const { data: sess } = await auth.supabase.auth.getSession();
  const source = `${b.source ?? 'settings_privacy'}`;
  const meta = requestMeta(request, jwtSessionId(sess.session?.access_token));
  const ev = await recordConsentEvidence(
    admin,
    auth.user.id,
    source,
    { action: b.action, textVersion: b.text_version, typedWord: b.typed_word, checkbox: b.checkbox, screenshotDataUrl: b.screenshot ?? b.screenshots?.[0] ?? null, extraScreenshots: (b.screenshots ?? []).slice(1), client: b.client ?? null },
    meta
  );
  if (!ev.ok) {
    const msg = ERR[ev.error];
    return NextResponse.json({ error: msg ?? 'השמירה נכשלה, נסה שוב', code: ev.error }, { status: msg ? 400 : 500 });
  }

  if (b.action === 'withdraw') {
    const r = await withdrawHealthConsent(admin, auth.user.id, { source, evidenceId: ev.id, requestId: meta.requestId ?? null });
    if (!r.ok) return NextResponse.json({ error: 'הביטול נכשל, נסה שוב' }, { status: 500 });
    return NextResponse.json({ active: false, measurements_deleted: r.measurementsDeleted, reference: ev.reference });
  }
  const r = await grantHealthConsent(admin, auth.user.id, { source, evidenceId: ev.id, requestId: meta.requestId ?? null });
  if (!r.ok) return NextResponse.json({ error: 'השמירה נכשלה, נסה שוב' }, { status: 500 });
  return NextResponse.json({ active: true, reference: ev.reference });
}
