import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchLessonSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(3000).nullable().optional(),
  lesson_type: z.enum(['video', 'audio', 'text', 'pdf', 'presentation', 'mixed']).optional(),
  text_content: z.string().max(100_000).nullable().optional(),
  tasks: z.array(z.record(z.unknown())).optional(),
  habits: z.array(z.record(z.unknown())).optional(),
  sort_order: z.number().int().optional(),
  duration_minutes: z.number().int().nullable().optional(),
  is_published: z.boolean().optional(),
  external_links: z.array(z.record(z.unknown())).optional(),
});

const mediaSchema = z.object({
  file_type: z.enum(['audio', 'pdf', 'presentation', 'video_url', 'image']),
  uploadthing_url: z.string().url().nullable().optional(),
  uploadthing_name: z.string().nullable().optional(),
  uploadthing_size: z.number().nullable().optional(),
  video_provider: z.enum(['bunny', 'heygen', 'youtube', 'vimeo', 'custom']).nullable().optional(),
  video_external_id: z.string().nullable().optional(),
  video_external_url: z.string().url().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

type RouteCtx = { params: Promise<{ id: string; lessonId: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { lessonId } = await ctx.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = patchLessonSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('lessons')
    .update(parsed.data)
    .eq('id', lessonId)
    .select('*')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה' }, { status: 500 });
  return NextResponse.json({ lesson: data });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { lessonId } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any).from('lessons').delete().eq('id', lessonId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { lessonId } = await ctx.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const value = body.value;

  if (value && typeof value === 'object' && 'media' in value) {
    const parsed = mediaSchema.safeParse((value as { media: unknown }).media);
    if (!parsed.success) return NextResponse.json({ error: 'מדיה לא תקינה' }, { status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (auth.supabase as any)
      .from('media_files')
      .insert({ ...parsed.data, lesson_id: lessonId })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה' }, { status: 500 });
    return NextResponse.json({ media: data });
  }

  return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
}
