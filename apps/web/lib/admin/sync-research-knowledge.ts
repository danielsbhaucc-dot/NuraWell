import type { Research } from '@/lib/types/journey';
import {
  resolveJourneyStepMeta,
  syncKnowledgeVectorsForRow,
  type AlmogKnowledgeRow,
} from '@/lib/admin/almog-knowledge';

export type ResearchSyncStep = {
  id: string;
  title?: string | null;
  course_id?: string | null;
  researches?: Research[] | null;
};

export type ResearchSyncResult = {
  synced: number;
  skipped: number;
  researches: Research[];
  errors: string[];
};

function hasResearchKnowledge(research: Research): boolean {
  return Boolean(
    research.ai_summary?.trim() ||
      research.key_findings?.some((x) => x.trim()) ||
      research.practical_takeaway?.trim()
  );
}

function buildResearchKnowledgeBody(params: {
  stepTitle?: string | null;
  research: Research;
}): string {
  const { stepTitle, research } = params;
  const findings = (research.key_findings ?? []).map((x) => x.trim()).filter(Boolean);

  return [
    'סוג ידע: מחקר מדעי משויך לשיעור במסע NuraWell.',
    stepTitle ? `שיעור: ${stepTitle}` : null,
    '',
    'ציטוט/מקור:',
    research.title ? `כותרת: ${research.title}` : null,
    research.authors ? `חוקרים: ${research.authors}` : null,
    research.year ? `שנה: ${research.year}` : null,
    research.journal ? `כתב עת: ${research.journal}` : null,
    research.url ? `קישור: ${research.url}` : null,
    '',
    research.ai_summary ? `סיכום לאלמוג:\n${research.ai_summary}` : null,
    findings.length ? `ממצאים עיקריים:\n${findings.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : null,
    research.practical_takeaway ? `משמעות פרקטית לשיעור:\n${research.practical_takeaway}` : null,
    research.limitations ? `סייגים:\n${research.limitations}` : null,
    research.evidence_level ? `רמת ביטחון/ראיות: ${research.evidence_level}` : null,
    research.finding ? `ממצא קצר שמוצג למשתמש:\n${research.finding}` : null,
  ]
    .filter((x) => x != null)
    .join('\n')
    .trim();
}

async function upsertResearchKnowledgeDoc(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  step: ResearchSyncStep;
  research: Research;
  createdBy: string;
}): Promise<string> {
  const { supabase, step, research, createdBy } = params;
  const stepMeta = await resolveJourneyStepMeta(supabase, step.id);
  if (!stepMeta.ok) throw new Error(stepMeta.error);

  const body = buildResearchKnowledgeBody({ stepTitle: step.title, research });
  const title = `מחקר: ${research.title || research.authors || research.id}`;

  const payload = {
    title,
    body,
    data_type: 'step' as const,
    access_level: 'public' as const,
    step_id: step.id,
    course_id: stepMeta.meta.stepCourseId ?? step.course_id ?? null,
    step_number: stepMeta.meta.stepNumber ?? null,
    station_id: stepMeta.meta.stationId ?? null,
    station_title: stepMeta.meta.stationTitle ?? null,
    station_order: stepMeta.meta.stationOrder ?? null,
  };

  let row: AlmogKnowledgeRow | null = null;
  let prevChunkCount = 0;

  if (research.rag_doc_id) {
    const { data: existing } = await supabase
      .from('almog_knowledge')
      .select('*')
      .eq('id', research.rag_doc_id)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('almog_knowledge')
        .update(payload)
        .eq('id', research.rag_doc_id)
        .select('*')
        .single();
      if (error || !updated) throw new Error(error?.message ?? 'שגיאת עדכון ידע מחקר');
      row = updated as AlmogKnowledgeRow;
      prevChunkCount = (existing as AlmogKnowledgeRow).chunk_count;
    }
  }

  if (!row) {
    const { data: inserted, error } = await supabase
      .from('almog_knowledge')
      .insert({
        ...payload,
        chunk_count: 0,
        created_by: createdBy,
      })
      .select('*')
      .single();
    if (error || !inserted) throw new Error(error?.message ?? 'שגיאת יצירת ידע מחקר');
    row = inserted as AlmogKnowledgeRow;
  }

  const { chunkCount } = await syncKnowledgeVectorsForRow(row, prevChunkCount);
  const { error: countErr } = await supabase
    .from('almog_knowledge')
    .update({ chunk_count: chunkCount })
    .eq('id', row.id);
  if (countErr) throw new Error(countErr.message);

  return row.id;
}

export async function syncStepResearchesToAlmogKnowledge(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  step: ResearchSyncStep;
  createdBy: string;
  researchId?: string;
  persistResearchUpdates?: boolean;
}): Promise<ResearchSyncResult> {
  const { supabase, step, createdBy, researchId, persistResearchUpdates = true } = params;
  const researches = [...(step.researches ?? [])];
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  let changed = false;

  for (let i = 0; i < researches.length; i += 1) {
    const research = researches[i]!;
    if (researchId && research.id !== researchId) continue;

    if (!hasResearchKnowledge(research)) {
      skipped += 1;
      continue;
    }

    try {
      const docId = await upsertResearchKnowledgeDoc({ supabase, step, research, createdBy });
      const nextResearch: Research = {
        ...research,
        rag_doc_id: docId,
        scan_status: 'ready',
      };
      researches[i] = nextResearch;
      if (research.rag_doc_id !== docId || research.scan_status !== nextResearch.scan_status) changed = true;
      synced += 1;
    } catch (e) {
      const label = research.title || research.id || `מחקר ${i + 1}`;
      errors.push(`${label}: ${e instanceof Error ? e.message : 'שגיאת סנכרון'}`);
    }
  }

  if (changed && persistResearchUpdates) {
    const { error } = await supabase
      .from('journey_steps')
      .update({ researches, updated_at: new Date().toISOString() })
      .eq('id', step.id);
    if (error) errors.push(`שמירת rag_doc_id נכשלה: ${error.message}`);
  }

  return { synced, skipped, researches, errors };
}
