import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/lib/api/route-guards';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertNotDemoAccessSession } from '@/lib/demo-access/server';
import { recordRetentionChoice } from '@/lib/privacy/subscription-retention';
import { DEFAULT_RETENTION_CHOICE, isRetentionChoice } from '@saas/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ choice: z.enum(['delete_now', 'keep_24m']) }).strict();

async function currentChoice(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('post_sub_retention, post_sub_retention_at').eq('id', userId).maybeSingle();
  const row = data as { post_sub_retention?: string | null; post_sub_retention_at?: string | null } | null;
  const raw = row?.post_sub_retention;
  return {
    admin,
    choice: isRetentionChoice(raw) ? raw : DEFAULT_RETENTION_CHOICE,
    // Accounts created before the choice existed fall back to keep_24m; the UI says so.
    is_default: !isRetentionChoice(raw),
    decided_at: row?.post_sub_retention_at ?? null,
  };
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    const { choice, is_default, decided_at } = await currentChoice(auth.user.id);
    return NextResponse.json({ choice, is_default, decided_at }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת הבחירה' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const demoGate = await assertNotDemoAccessSession(auth.user.id);
  if (!demoGate.ok) return NextResponse.json({ error: demoGate.message }, { status: 403 });

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'בחירה לא תקינה' }, { status: 400 });

  try {
    const cur = await currentChoice(auth.user.id);
    const previous = cur.is_default ? null : cur.choice;
    if (previous === parsed.data.choice) {
      return NextResponse.json({ ok: true, choice: previous, unchanged: true });
    }
    const res = await recordRetentionChoice(cur.admin, {
      userId: auth.user.id,
      choice: parsed.data.choice,
      source: 'settings',
      previous,
    });
    if (!res.ok) return NextResponse.json({ error: 'שמירת הבחירה נכשלה' }, { status: 500 });
    return NextResponse.json({ ok: true, choice: parsed.data.choice });
  } catch {
    return NextResponse.json({ error: 'שמירת הבחירה נכשלה' }, { status: 500 });
  }
}
