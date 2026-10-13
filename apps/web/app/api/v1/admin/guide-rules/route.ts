import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { GuideRules, readGuideRules, writeGuideRules } from '@/lib/guides/guide-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** GET/PUT /api/v1/admin/guide-rules — when Almog may open guides (site_settings.guide_rules). */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rules: await readGuideRules(createAdminClient()) });
}

export async function PUT(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = GuideRules.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_rules', issues: parsed.error.issues }, { status: 400 });
  const write = await writeGuideRules(createAdminClient(), parsed.data);
  if (!write.ok) return NextResponse.json({ error: write.error ?? 'save_failed' }, { status: 500 });
  return NextResponse.json({ ok: true, rules: parsed.data });
}
