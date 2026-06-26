import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { syncGuideToAlmogKnowledge } from '@/lib/guides/sync-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** סנכרון כל המדריכים המפורסמים ל-RAG של אלמוג. */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 10, windowSeconds: 60 },
    { limit: 30, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: guides, error } = await (auth.supabase as any)
    .from('courses')
    .select('id, title, description, is_premium, is_published, lessons(id, title, description, lesson_type, text_content, tasks, habits, sort_order, duration_minutes, is_published, media_files(file_type))')
    .eq('is_published', true)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let chunks = 0;
  const errors: string[] = [];

  for (const guide of guides ?? []) {
    const lessons = (guide.lessons ?? []).filter(
      (l: { is_published?: boolean | null }) => l.is_published !== false
    );
    try {
      const result = await syncGuideToAlmogKnowledge({
        supabase: auth.supabase,
        guide: { ...guide, lessons },
        createdBy: auth.user.id,
      });
      synced++;
      chunks += result.chunkCount;
    } catch (e) {
      errors.push(`${guide.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    total_chunks: chunks,
    errors: errors.length ? errors : undefined,
  });
}
