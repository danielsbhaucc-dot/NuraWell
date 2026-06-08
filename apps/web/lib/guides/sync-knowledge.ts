import {
  syncKnowledgeVectorsForRow,
  deleteKnowledgeRowVectors,
  type AlmogKnowledgeRow,
} from '@/lib/admin/almog-knowledge';

interface GuideLessonForSync {
  id: string;
  title: string;
  description?: string | null;
  lesson_type?: string | null;
  text_content?: string | null;
  tasks?: Array<{ title?: string; description?: string }> | null;
  habits?: Array<{ title?: string }> | null;
  sort_order: number;
  duration_minutes?: number | null;
}

interface GuideForSync {
  id: string;
  title: string;
  description?: string | null;
  is_premium?: boolean | null;
  lessons: GuideLessonForSync[];
}

function buildGuideKnowledgeBody(guide: GuideForSync): string {
  const lines: string[] = [
    `מדריך: ${guide.title}`,
    guide.description ? `תיאור: ${guide.description}` : null,
    '',
    'פרקים:',
  ].filter((x) => x != null) as string[];

  const sorted = [...guide.lessons].sort((a, b) => a.sort_order - b.sort_order);
  for (const lesson of sorted) {
    lines.push(`\n--- פרק ${lesson.sort_order + 1}: ${lesson.title} ---`);
    if (lesson.description) lines.push(lesson.description);
    if (lesson.lesson_type) lines.push(`סוג: ${lesson.lesson_type}`);
    if (lesson.duration_minutes) lines.push(`משך: ${lesson.duration_minutes} דקות`);
    if (lesson.text_content?.trim()) {
      const text = lesson.text_content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push(text.slice(0, 3000));
    }
    const tasks = lesson.tasks ?? [];
    if (tasks.length) {
      lines.push('משימות:');
      tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title ?? ''} ${t.description ?? ''}`.trim()));
    }
    const habits = lesson.habits ?? [];
    if (habits.length) {
      lines.push('הרגלים:');
      habits.forEach((h, i) => lines.push(`${i + 1}. ${h.title ?? ''}`.trim()));
    }
  }

  return lines.join('\n').trim();
}

/** מסנכרן תוכן מדריך ל-almog_knowledge + vectors. */
export async function syncGuideToAlmogKnowledge(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  guide: GuideForSync;
  createdBy: string;
}): Promise<{ docId: string; chunkCount: number }> {
  const { supabase, guide, createdBy } = params;
  const body = buildGuideKnowledgeBody(guide);
  const title = `מדריך: ${guide.title}`;
  const accessLevel = guide.is_premium ? 'premium' : 'public';

  const payload = {
    title,
    body,
    data_type: 'course' as const,
    access_level: accessLevel,
    step_id: null,
    course_id: guide.id,
    step_number: null,
    station_id: null,
    station_title: null,
    station_order: null,
  };

  const { data: existing } = await supabase
    .from('almog_knowledge')
    .select('*')
    .eq('data_type', 'course')
    .eq('course_id', guide.id)
    .maybeSingle();

  let row: AlmogKnowledgeRow;

  if (existing) {
    const { data: updated, error } = await supabase
      .from('almog_knowledge')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !updated) throw new Error(error?.message ?? 'שגיאת עדכון ידע מדריך');
    row = updated as AlmogKnowledgeRow;
    const { chunkCount } = await syncKnowledgeVectorsForRow(row, existing.chunk_count);
    await supabase.from('almog_knowledge').update({ chunk_count: chunkCount }).eq('id', row.id);
    return { docId: row.id, chunkCount };
  }

  const { data: inserted, error } = await supabase
    .from('almog_knowledge')
    .insert({ ...payload, chunk_count: 0, created_by: createdBy })
    .select('*')
    .single();
  if (error || !inserted) throw new Error(error?.message ?? 'שגיאת יצירת ידע מדריך');
  row = inserted as AlmogKnowledgeRow;
  const { chunkCount } = await syncKnowledgeVectorsForRow(row, 0);
  await supabase.from('almog_knowledge').update({ chunk_count: chunkCount }).eq('id', row.id);
  return { docId: row.id, chunkCount };
}

/** מוחק ידע מדריך מ-RAG. */
export async function deleteGuideFromAlmogKnowledge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  courseId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from('almog_knowledge')
    .select('id, chunk_count')
    .eq('data_type', 'course')
    .eq('course_id', courseId);

  for (const row of rows ?? []) {
    await deleteKnowledgeRowVectors(row);
    await supabase.from('almog_knowledge').delete().eq('id', row.id);
  }
}
