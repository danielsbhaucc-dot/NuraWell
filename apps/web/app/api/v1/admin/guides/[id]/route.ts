import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { syncGuideToAlmogKnowledge, deleteGuideFromAlmogKnowledge } from '@/lib/guides/sync-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchGuideSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  is_published: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  visibility: z.enum(['hidden', 'discoverable']).optional(),
  unlock_at: z.string().datetime().nullable().optional(),
  sort_order: z.number().int().optional(),
  background_image_key: z.string().nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('courses')
    .select('*, lessons(*, media_files(file_type))')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'מדריך לא נמצא' }, { status: 404 });
  return NextResponse.json({ guide: data });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = patchGuideSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('courses')
    .update(parsed.data)
    .eq('id', id)
    .select('*, lessons(*)')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה' }, { status: 500 });

  if (data.is_published) {
    try {
      await syncGuideToAlmogKnowledge({
        supabase: auth.supabase,
        guide: {
          id: data.id,
          title: data.title,
          description: data.description,
          is_premium: data.is_premium,
          lessons: (data.lessons ?? []).map((l: Record<string, unknown>) => ({
            id: l.id as string,
            title: l.title as string,
            description: l.description as string | null,
            lesson_type: l.lesson_type as string | null,
            text_content: l.text_content as string | null,
            tasks: l.tasks as Array<{ title?: string; description?: string }> | null,
            habits: l.habits as Array<{ title?: string }> | null,
            media_files: (l.media_files as Array<{ file_type?: string }> | null) ?? [],
            sort_order: l.sort_order as number,
            duration_minutes: l.duration_minutes as number | null,
          })),
        },
        createdBy: auth.user.id,
      });
    } catch (syncErr) {
      console.warn('[admin/guides] rag_sync_failed', syncErr);
    }
  }

  return NextResponse.json({ guide: data });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  try {
    await deleteGuideFromAlmogKnowledge(auth.supabase, id);
  } catch (e) {
    console.warn('[admin/guides] rag_delete_failed', e);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any).from('courses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
