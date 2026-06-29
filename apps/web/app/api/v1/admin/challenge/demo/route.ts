import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { TOKEN_TTL_MS, createChallengeDemoToken } from '@/lib/challenge/demo-token';
import { upsertDemoEnrollment, clearDemoEnrollment } from '@/lib/challenge/enrollment';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z.object({
  scenario: z.enum(['waiting', 'intro', 'active', 'wrap_up', 'full']),
  simulated_day: z.number().int().min(1).max(14).optional(),
});

/** יצירת קישור דמו — רק מנהל מ-OPS */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = startSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'תרחיש דמו לא תקין' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { enrollment, error: enrollError } = await upsertDemoEnrollment(
    admin,
    auth.user.id,
    parsed.data.scenario,
    parsed.data.simulated_day,
  );

  if (!enrollment) {
    return NextResponse.json(
      { error: enrollError ?? 'לא ניתן ליצור הרשמת דמו' },
      { status: 500 },
    );
  }

  let token: string;
  try {
    token = createChallengeDemoToken(
      auth.user.id,
      parsed.data.scenario,
      parsed.data.simulated_day,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'חסר מפתח חתימה לדמו';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const appBase = publicAppBaseNoSlashSync() || new URL(request.url).origin;
  const demoUrl = `${appBase}/challenge/demo?t=${encodeURIComponent(token)}`;

  return NextResponse.json({
    demo_url: demoUrl,
    expires_in_seconds: Math.floor(TOKEN_TTL_MS / 1000),
    scenario: parsed.data.scenario,
    enrollment_id: enrollment.id,
  });
}

/** יציאה מדמו */
export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  await clearDemoEnrollment(createAdminClient(), auth.user.id);
  return NextResponse.json({ ok: true });
}
