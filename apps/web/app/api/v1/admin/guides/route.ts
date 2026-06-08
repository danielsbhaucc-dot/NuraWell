import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { syncGuideToAlmogKnowledge } from '@/lib/guides/sync-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createGuideSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  is_published: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  visibility: z.enum(['hidden', 'discoverable']).optional(),
  unlock_at: z.string().datetime().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('courses')
    .select('id, title, description, thumbnail_url, background_image_key, is_published, is_premium, visibility, unlock_at, sort_order, created_at, lessons(id, title, sort_order, is_published)')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guides: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  const parsed = createGuideSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('courses')
    .insert({
      ...parsed.data,
      created_by: auth.user.id,
    })
    .select('id, title, description, is_published, is_premium, visibility, unlock_at, sort_order')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה' }, { status: 500 });
  return NextResponse.json({ guide: data });
}
