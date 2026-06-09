import { NextResponse } from 'next/server';
import { syncStepResearchesToAlmogKnowledge } from '@/lib/admin/sync-research-knowledge';
import { isSystemKnowledgeVectorConfigured } from '@/lib/ai/system-knowledge-vector';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import type { Research } from '@/lib/types/journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StepRow = {
  id: string;
  title: string | null;
  course_id: string | null;
  researches: Research[] | null;
};

function stepHasReadyResearch(researches: Research[] | null): boolean {
  if (!Array.isArray(researches)) return false;
  return researches.some(
    (r) =>
      r.ai_summary?.trim() ||
      r.key_findings?.some((x) => x.trim()) ||
      r.practical_takeaway?.trim()
  );
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY חסר ליצירת embeddings' }, { status: 500 });
  }
  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json({ error: 'משתני Upstash system-knowledge חסרים' }, { status: 500 });
  }

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('journey_steps')
    .select('id, title, course_id, researches')
    .order('step_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const steps = ((data ?? []) as StepRow[]).filter((s) => stepHasReadyResearch(s.researches));

  let stepsSynced = 0;
  let researchesSynced = 0;
  let researchesSkipped = 0;
  const errors: string[] = [];

  for (const step of steps) {
    try {
      const result = await syncStepResearchesToAlmogKnowledge({
        supabase,
        step: {
          id: step.id,
          title: step.title,
          course_id: step.course_id,
          researches: (step.researches ?? []) as Research[],
        },
        createdBy: auth.user.id,
        persistResearchUpdates: true,
      });
      researchesSynced += result.synced;
      researchesSkipped += result.skipped;
      if (result.synced > 0) stepsSynced += 1;
      if (result.errors.length) {
        errors.push(`${step.title ?? step.id}: ${result.errors.join(' | ')}`);
      }
    } catch (e) {
      errors.push(`${step.title ?? step.id}: ${e instanceof Error ? e.message : 'שגיאת סנכרון'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    stepsScanned: steps.length,
    stepsSynced,
    researchesSynced,
    researchesSkipped,
    errors: errors.slice(0, 30),
  });
}
