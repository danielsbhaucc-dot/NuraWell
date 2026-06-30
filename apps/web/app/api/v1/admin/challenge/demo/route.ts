import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { TOKEN_TTL_MS, createChallengeDemoToken } from '@/lib/challenge/demo-token';
import { ensureChallengeOpsSchema } from '@/lib/challenge/ensure-challenge-schema';
import { upsertDemoEnrollment, clearDemoEnrollment } from '@/lib/challenge/enrollment';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z.object({
  scenario: z.enum(['waiting', 'intro', 'active', 'wrap_up', 'full']),
  simulated_day: z.number().int().min(1).max(14).optional(),
});

type DemoScenario = z.infer<typeof startSchema>['scenario'];

const parseStartPayload = (payload: unknown) => {
  const parsed = startSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'תרחיש דמו לא תקין' }, { status: 400 }),
    };
  }

  return { ok: true as const, value: parsed.data };
};

const createDemoEnrollment = async (
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  scenario: DemoScenario,
  simulatedDay?: number,
) => {
  const { enrollment, error } = await upsertDemoEnrollment(admin, userId, scenario, simulatedDay);
  if (!enrollment) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error ?? 'לא ניתן ליצור הרשמת דמו' }, { status: 500 }),
    };
  }

  return { ok: true as const, enrollment };
};

const createDemoTokenResponse = (
  userId: string,
  scenario: DemoScenario,
  simulatedDay?: number,
) => {
  try {
    return {
      ok: true as const,
      token: createChallengeDemoToken(userId, scenario, simulatedDay),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'חסר מפתח חתימה לדמו';
    return {
      ok: false as const,
      response: NextResponse.json({ error: message }, { status: 500 }),
    };
  }
};

const createDemoUrlResponse = async (
  request: Request,
  userId: string,
  scenario: DemoScenario,
  simulatedDay?: number,
) => {
  const admin = createAdminClient();
  await ensureChallengeOpsSchema(admin);

  const enrollmentResult = await createDemoEnrollment(admin, userId, scenario, simulatedDay);
  if (!enrollmentResult.ok) return enrollmentResult.response;

  const tokenResult = createDemoTokenResponse(userId, scenario, simulatedDay);
  if (!tokenResult.ok) return tokenResult.response;

  const appBase = new URL(request.url).origin;
  const demoUrl = `${appBase}/challenge/demo?t=${encodeURIComponent(tokenResult.token)}`;
  return NextResponse.json({
    demo_url: demoUrl,
    expires_in_seconds: Math.floor(TOKEN_TTL_MS / 1000),
    scenario,
    enrollment_id: enrollmentResult.enrollment.id,
  });
};

/** יצירת קישור דמו — רק מנהל מ-OPS */
export const POST = async (request: Request) => {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = parseStartPayload(raw.value);
  if (!parsed.ok) return parsed.response;

  return createDemoUrlResponse(
    request,
    auth.user.id,
    parsed.value.scenario,
    parsed.value.simulated_day,
  );
};

/** יציאה מדמו */
export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  await clearDemoEnrollment(createAdminClient(), auth.user.id);
  return NextResponse.json({ ok: true });
}
