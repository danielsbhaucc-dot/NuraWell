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
  media_files?: Array<{ file_type?: string | null }> | null;
  sort_order: number;
  duration_minutes?: number | null;
}

const LESSON_TYPE_LABELS: Record<string, string> = {
  video: 'וידאו',
  audio: 'אודיו',
  text: 'טקסט',
  pdf: 'PDF',
  presentation: 'מצגת',
  mixed: 'מגוון',
};

interface GuideForSync {
  id: string;
  title: string;
  description?: string | null;
  is_premium?: boolean | null;
  lessons: GuideLessonForSync[];
}

const MAX_TEXT_PER_CHAPTER = 4000;

function buildLessonKnowledgeBody(guide: GuideForSync, lesson: GuideLessonForSync): string {
  const lines: string[] = [
    `מדריך: ${guide.title}`,
    `פרק ${lesson.sort_order + 1}: ${lesson.title}`,
    lesson.description ? `תיאור: ${lesson.description}` : null,
    lesson.lesson_type
      ? `סוג תוכן: ${LESSON_TYPE_LABELS[lesson.lesson_type] ?? lesson.lesson_type}`
      : null,
    lesson.duration_minutes ? `משך: ${lesson.duration_minutes} דקות` : null,
  ].filter((x) => x != null) as string[];

  const mediaTypes = [...new Set((lesson.media_files ?? []).map((m) => m.file_type).filter(Boolean))];
  if (mediaTypes.length) lines.push(`מדיה: ${mediaTypes.join(', ')}`);

  if (lesson.text_content?.trim()) {
    const text = lesson.text_content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    lines.push('', 'תוכן:', text.slice(0, MAX_TEXT_PER_CHAPTER));
  }

  const tasks = lesson.tasks ?? [];
  if (tasks.length) {
    lines.push('', 'משימות:');
    tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title ?? ''} ${t.description ?? ''}`.trim()));
  }

  const habits = lesson.habits ?? [];
  if (habits.length) {
    lines.push('', 'הרגלים:');
    habits.forEach((h, i) => lines.push(`${i + 1}. ${h.title ?? ''}`.trim()));
  }

  return lines.join('\n').trim();
}

function buildGuideOverviewBody(guide: GuideForSync): string {
  const sorted = [...guide.lessons].sort((a, b) => a.sort_order - b.sort_order);
  const totalMinutes = sorted.reduce((s, l) => s + (l.duration_minutes ?? 15), 0);
  const lines = [
    `מדריך: ${guide.title}`,
    guide.description ? `תיאור: ${guide.description}` : null,
    `סיכום: ${sorted.length} פרקים | ~${totalMinutes} דקות`,
    '',
    'רשימת פרקים:',
    ...sorted.map((l, i) => `${i + 1}. ${l.title}`),
  ].filter((x) => x != null) as string[];
  return lines.join('\n').trim();
}

async function upsertChapterKnowledgeRow(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  guide: GuideForSync;
  lesson: GuideLessonForSync | null;
  createdBy: string;
  accessLevel: 'public' | 'premium';
}): Promise<{ docId: string; chunkCount: number }> {
  const { supabase, guide, lesson, createdBy, accessLevel } = params;
  const isOverview = !lesson;
  const body = isOverview ? buildGuideOverviewBody(guide) : buildLessonKnowledgeBody(guide, lesson!);
  const title = isOverview
    ? `מדריך: ${guide.title} (סקירה)`
    : `מדריך: ${guide.title} · פרק: ${lesson!.title}`;

  const payload = {
    title,
    body,
    data_type: 'course' as const,
    access_level: accessLevel,
    step_id: null,
    course_id: guide.id,
    step_number: null,
    station_id: lesson?.id ?? null,
    station_title: lesson?.title ?? null,
    station_order: lesson?.sort_order ?? null,
  };

  let query = supabase
    .from('almog_knowledge')
    .select('*')
    .eq('data_type', 'course')
    .eq('course_id', guide.id);

  if (isOverview) {
    query = query.is('station_id', null);
  } else {
    query = query.eq('station_id', lesson!.id);
  }

  const { data: existing } = await query.maybeSingle();

  let row: AlmogKnowledgeRow;

  if (existing) {
    const { data: updated, error } = await supabase
      .from('almog_knowledge')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !updated) throw new Error(error?.message ?? 'שגיאת עדכון ידע פרק');
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
  if (error || !inserted) throw new Error(error?.message ?? 'שגיאת יצירת ידע פרק');
  row = inserted as AlmogKnowledgeRow;
  const { chunkCount } = await syncKnowledgeVectorsForRow(row, 0);
  await supabase.from('almog_knowledge').update({ chunk_count: chunkCount }).eq('id', row.id);
  return { docId: row.id, chunkCount };
}

/** מסנכרן תוכן מדריך ל-almog_knowledge — מסמך נפרד לכל פרק + סקירה קצרה. */
export async function syncGuideToAlmogKnowledge(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  guide: GuideForSync;
  createdBy: string;
}): Promise<{ docId: string; chunkCount: number }> {
  const { supabase, guide, createdBy } = params;
  const accessLevel = guide.is_premium ? 'premium' : 'public';
  const sorted = [...guide.lessons].sort((a, b) => a.sort_order - b.sort_order);

  let totalChunks = 0;
  let lastDocId = '';

  const overview = await upsertChapterKnowledgeRow({
    supabase,
    guide,
    lesson: null,
    createdBy,
    accessLevel,
  });
  totalChunks += overview.chunkCount;
  lastDocId = overview.docId;

  for (const lesson of sorted) {
    const result = await upsertChapterKnowledgeRow({
      supabase,
      guide,
      lesson,
      createdBy,
      accessLevel,
    });
    totalChunks += result.chunkCount;
    lastDocId = result.docId;
  }

  return { docId: lastDocId, chunkCount: totalChunks };
}

/** מסנכרן פרק בודד (לאחר עריכה). */
export async function syncGuideLessonToAlmogKnowledge(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  guide: GuideForSync;
  lessonId: string;
  createdBy: string;
}): Promise<{ docId: string; chunkCount: number } | null> {
  const lesson = params.guide.lessons.find((l) => l.id === params.lessonId);
  if (!lesson) return null;
  return upsertChapterKnowledgeRow({
    supabase: params.supabase,
    guide: params.guide,
    lesson,
    createdBy: params.createdBy,
    accessLevel: params.guide.is_premium ? 'premium' : 'public',
  });
}

/** מוחק ידע מדריך מ-RAG (כל הפרקים). */
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

/** @deprecated — תאימות לאחור; השתמש ב-buildLessonKnowledgeBody */
export function buildGuideKnowledgeBody(guide: GuideForSync): string {
  return buildGuideOverviewBody(guide);
}
