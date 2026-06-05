import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncStepResearchesToAlmogKnowledge } from '@/lib/admin/sync-research-knowledge';
import { isSystemKnowledgeVectorConfigured } from '@/lib/ai/system-knowledge-vector';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import type { Research } from '@/lib/types/journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const syncSchema = z.object({
  stepId: z.string().uuid(),
  researchId: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY חסר ליצירת embeddings' }, { status: 500 });
  }
  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json({ error: 'משתני Upstash system-knowledge חסרים' }, { status: 500 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = syncSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { stepId, researchId } = parsed.data;
  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: step, error } = await (supabase as any)
    .from('journey_steps')
    .select('id, title, course_id, researches')
    .eq('id', stepId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!step) return NextResponse.json({ error: 'הצעד לא נמצא' }, { status: 404 });

  const result = await syncStepResearchesToAlmogKnowledge({
    supabase,
    step: {
      id: step.id as string,
      title: (step.title as string | null) ?? null,
      course_id: (step.course_id as string | null) ?? null,
      researches: ((step.researches as Research[] | null) ?? []) as Research[],
    },
    createdBy: auth.user.id,
    researchId,
    persistResearchUpdates: true,
  });

  if (result.errors.length > 0 && result.synced === 0) {
    return NextResponse.json({ error: result.errors.join('\n'), ...result }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result });
}
