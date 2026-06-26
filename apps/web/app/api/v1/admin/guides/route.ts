import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
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

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('courses')
    .select('id, title, description, thumbnail_url, background_image_key, is_published, is_premium, visibility, unlock_at, sort_order, created_at, lessons(id, title, sort_order, is_published)')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const guideIds = (data ?? []).map((g: { id: string }) => g.id);
  const ragByCourse = new Map<string, { chunk_count: number; id: string }>();
  if (guideIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: knowledgeRows } = await (auth.supabase as any)
      .from('almog_knowledge')
      .select('id, course_id, chunk_count')
      .eq('data_type', 'course')
      .in('course_id', guideIds);
    for (const row of knowledgeRows ?? []) {
      if (!row.course_id) continue;
      const prev = ragByCourse.get(row.course_id);
      ragByCourse.set(row.course_id, {
        id: row.id,
        chunk_count: (prev?.chunk_count ?? 0) + (row.chunk_count ?? 0),
      });
    }
  }

  const guides = (data ?? []).map((g: { id: string }) => ({
    ...g,
    rag: ragByCourse.get(g.id) ?? null,
  }));

  return NextResponse.json({ guides });
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createGuideSchema.safeParse(body.value);
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
