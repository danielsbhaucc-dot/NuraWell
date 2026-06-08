import {
  deleteKnowledgeDocVectors,
  ingestKnowledgeDoc,
  type AlmogKnowledgeDocInput,
} from '@/lib/ai/system-knowledge-store';
import { isSystemKnowledgeVectorConfigured } from '@/lib/ai/system-knowledge-vector';

export type AlmogKnowledgeRow = {
  id: string;
  title: string;
  body: string;
  data_type: 'step' | 'course' | 'principle';
  access_level: 'public' | 'premium';
  step_id: string | null;
  course_id: string | null;
  step_number: number | null;
  station_id: string | null;
  station_title: string | null;
  station_order: number | null;
  chunk_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StepMeta = {
  stepNumber?: number;
  stepCourseId?: string | null;
  stationId?: string;
  stationTitle?: string;
  stationOrder?: number;
};

export async function resolveJourneyStepMeta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  stepId: string
): Promise<{ ok: true; meta: StepMeta } | { ok: false; error: string; status: number }> {
  const { data: stepRow, error: stepErr } = await supabase
    .from('journey_steps')
    .select('id, step_number, course_id, station_id, journey_stations(id, title, sort_order)')
    .eq('id', stepId)
    .maybeSingle();

  if (stepErr) {
    return { ok: false, error: 'שגיאה בטעינת הצעד', status: 500 };
  }
  if (!stepRow) {
    return { ok: false, error: 'הצעד לא נמצא במסד', status: 400 };
  }

  const meta: StepMeta = {
    stepNumber: stepRow.step_number as number,
    stepCourseId: (stepRow.course_id as string | null) ?? null,
  };

  const st = stepRow.journey_stations as
    | { id?: string; title?: string; sort_order?: number }
    | { id?: string; title?: string; sort_order?: number }[]
    | null;
  const station = Array.isArray(st) ? st[0] : st;
  if (station?.id) {
    meta.stationId = station.id;
    if (typeof station.title === 'string') meta.stationTitle = station.title;
    if (typeof station.sort_order === 'number') meta.stationOrder = station.sort_order;
  }

  return { ok: true, meta };
}

export function rowToDocInput(row: AlmogKnowledgeRow): AlmogKnowledgeDocInput {
  return {
    docId: row.id,
    body: row.body,
    dataType: row.data_type,
    accessLevel: row.access_level,
    stepId: row.step_id,
    courseId: row.course_id,
    stepNumber: row.step_number,
    stationId: row.station_id,
    stationTitle: row.station_title,
    stationOrder: row.station_order,
  };
}

export async function syncKnowledgeVectorsForRow(
  row: AlmogKnowledgeRow,
  prevChunkCount?: number
): Promise<{ chunkCount: number }> {
  if (!isSystemKnowledgeVectorConfigured()) {
    throw new Error('משתני אינדקס ידע מערכת חסרים');
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error('OPENROUTER_API_KEY חסר');
  }

  const prev = prevChunkCount ?? row.chunk_count;
  if (prev > 0) {
    await deleteKnowledgeDocVectors(row.id, prev);
  }

  const result = await ingestKnowledgeDoc(rowToDocInput(row));
  return { chunkCount: result.chunkCount };
}

export async function deleteKnowledgeRowVectors(row: Pick<AlmogKnowledgeRow, 'id' | 'chunk_count'>): Promise<void> {
  if (!isSystemKnowledgeVectorConfigured() || row.chunk_count <= 0) return;
  await deleteKnowledgeDocVectors(row.id, row.chunk_count);
}
