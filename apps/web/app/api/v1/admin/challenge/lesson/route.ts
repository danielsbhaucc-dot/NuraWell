import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { DEFAULT_EATING_WINDOW_LESSON, type ChallengeEatingWindowLesson } from '@/lib/challenge/content';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from('site_settings')
    .select('challenge_eating_window_lesson')
    .eq('id', 1)
    .maybeSingle();

  return NextResponse.json({
    lesson: (data?.challenge_eating_window_lesson as ChallengeEatingWindowLesson | null) ?? DEFAULT_EATING_WINDOW_LESSON,
  });
}

const patchSchema = z.object({
  title: z.string().min(1).max(200),
  body_html: z.string().min(1).max(8000),
  video_url: z.string().url().nullable().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const lesson: ChallengeEatingWindowLesson = {
    title: parsed.data.title,
    body_html: parsed.data.body_html,
    video_url: parsed.data.video_url ?? null,
  };

  const { error } = await auth.supabase
    .from('site_settings')
    .update({ challenge_eating_window_lesson: lesson, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: 'lesson.patch',
    entity_type: 'eating_window_lesson',
    summary: `עדכון שיעור חלון אכילה: ${lesson.title}`,
    payload: { title: lesson.title },
  });

  return NextResponse.json({ lesson });
}
