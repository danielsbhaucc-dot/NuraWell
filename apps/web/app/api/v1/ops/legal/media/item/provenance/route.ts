import { relinkAsset } from '@/lib/legal/media/links';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { provenanceInputSchema, updateProvenance } from '@/lib/legal/media/provenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({ key: z.string().min(3).max(400), provenance: provenanceInputSchema }).strict();

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_input', issues: p.error.issues.slice(0, 4).map((i) => i.path.join('.')) }, { status: 400 });
  const admin = createAdminClient();
  const r = await updateProvenance(admin, p.data.key, p.data.provenance, { id: auth.user.id });
  if (r.ok) await relinkAsset(admin).catch(() => 0);
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'not_found' ? 404 : 500 });
}
