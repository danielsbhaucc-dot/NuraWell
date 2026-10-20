import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { COMPLIANCE_ITEMS, allItemKeys, itemNextDue, itemState } from '@/lib/privacy/compliance-checklist';
import { loadCompliance } from '@/lib/privacy/compliance-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return notFound();
  const { rows, map, facts, drillMeta, lastUpdated, docs } = await loadCompliance(createAdminClient());
  const now = new Date();
  // server-computed status: done items reopen automatically when their interval comes around
  const status = Object.fromEntries(COMPLIANCE_ITEMS.map((i) => [i.key, { state: itemState(i, map, facts, now), nextDue: itemNextDue(i, map, facts)?.toISOString() ?? null }]));
  return NextResponse.json({ rows, facts, drillMeta, lastUpdated, docs, status, now: now.toISOString() }, { headers: NO_STORE });
}

const Body = z.object({ key: z.string().max(80), done: z.boolean() });

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return notFound();
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-privacy-compliance', [{ limit: 60, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success || !allItemKeys().includes(p.data.key)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from('owner_compliance_status').upsert(
    { item_key: p.data.key, done: p.data.done, done_at: p.data.done ? now : null, updated_at: now, updated_by: auth.user.id },
    { onConflict: 'item_key' },
  );
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 });
  await db.from('admin_audit_log').insert({ actor_id: auth.user.id, method: 'COMPLIANCE', path: `privacy_checklist:${p.data.key}`, detail: { done: p.data.done } });
  return NextResponse.json({ ok: true, updated_at: now }, { headers: NO_STORE });
}
