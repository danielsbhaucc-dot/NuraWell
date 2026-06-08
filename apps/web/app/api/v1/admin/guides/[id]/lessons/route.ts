import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const lessonSchema = z.object({
  title: z.string().min(1).max(200),
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

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: courseId } = await ctx.params;
  const body = await readJsonBody(request);
  const parsed = lessonSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase as any)
    .from('lessons')
    .insert({ ...parsed.data, course_id: courseId })
    .select('*')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'שגיאה' }, { status: 500 });
  return NextResponse.json({ lesson: data });
}
