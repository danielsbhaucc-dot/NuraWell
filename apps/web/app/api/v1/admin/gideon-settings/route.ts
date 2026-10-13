import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { GideonSettingsInput, readGideonSettings, writeGideonSettings } from '@/lib/ceo/settings';
import { audit } from '@/lib/ceo/actions';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only. GET never returns secrets — only masked hints. PUT: secrets are write-only. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ settings: await readGideonSettings(createAdminClient()) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = GideonSettingsInput.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  }
  const db = createAdminClient();
  const w = await writeGideonSettings(db, parsed.data, auth.user.id);
  if (!w.ok) return NextResponse.json({ error: w.error ?? 'save_failed' }, { status: 500 });
  // audit without secret values
  await audit(db, `admin:${auth.user.id}`, 'gideon_settings', {
    token_changed: parsed.data.telegram_bot_token !== undefined,
    webhook_secret_changed: parsed.data.telegram_webhook_secret !== undefined,
    recipients: parsed.data.recipients.length,
  }).catch(() => {});
  return NextResponse.json({ ok: true, settings: await readGideonSettings(db) }, { headers: { 'Cache-Control': 'no-store' } });
}
