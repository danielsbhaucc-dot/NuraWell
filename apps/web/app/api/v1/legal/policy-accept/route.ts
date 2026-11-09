import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { acceptCurrentPolicy } from '@/lib/legal/policy-reaccept';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ version: z.string().min(1).max(32) }).strict();

/** Records acceptance of the current privacy policy and terms (re-accept prompt). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('accepted_policy_version').eq('id', user.id).maybeSingle();
  const previous = (profile?.accepted_policy_version as string | null | undefined) ?? null;

  const result = await acceptCurrentPolicy(admin, user.id, parsed.data.version, previous);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, version: result.version });
}
