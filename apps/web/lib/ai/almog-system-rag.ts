import { escapeFilterString, querySystemKnowledgeVectors } from '@/lib/ai/system-knowledge-vector';

export type JourneyRagProgressState = {
  maxStepNumber: number;
  totalPublishedSteps: number;
  allJourneyComplete: boolean;
  currentStationTitle: string | null;
  currentStepNumber: number | null;
  totalStations: number;
};

/**
 * חישוב עד איזה מספר צעד מותר לשלוף מידע מערכת (RAG) — רק צעדים שהמשתמש נגע בהם או סיים;
 * אם כל הצעדים המפורסמים הושלמו — נפתח כל החומר.
 */
export async function fetchJourneyProgressCapForRag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<JourneyRagProgressState> {
  const { data: publishedSteps } = await supabase
    .from('journey_steps')
    .select('id, step_number')
    .eq('is_published', true)
    .order('step_number');

  const { data: progressRows } = await supabase
    .from('journey_progress')
    .select('step_id, is_completed, updated_at')
    .eq('user_id', userId);

  const steps = (publishedSteps ?? []) as Array<{ id: string; step_number: number }>;
  const progList = (progressRows ?? []) as Array<{
    step_id: string;
    is_completed: boolean;
    updated_at: string;
  }>;

  const progByStep = new Map(progList.map((p) => [p.step_id, p]));

  let maxStarted = 0;
  for (const s of steps) {
    if (progByStep.has(s.id)) {
      maxStarted = Math.max(maxStarted, s.step_number);
    }
  }

  const allComplete =
    steps.length > 0 && steps.every((s) => progByStep.get(s.id)?.is_completed === true);

  const nums = steps.map((s) => s.step_number);
  const maxPublished = nums.length ? Math.max(...nums) : 0;
  const maxStepNumber = allComplete ? maxPublished : maxStarted;

  const { count: stationCount } = await supabase
    .from('journey_stations')
    .select('*', { count: 'exact', head: true });

  const latest = [...progList].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];

  let currentStationTitle: string | null = null;
  let currentStepNumber: number | null = null;

  if (latest) {
    const { data: stepRow } = await supabase
      .from('journey_steps')
      .select('step_number, journey_stations(title)')
      .eq('id', latest.step_id)
      .maybeSingle();

    if (stepRow) {
      currentStepNumber = stepRow.step_number as number;
      const st = stepRow.journey_stations as { title?: string } | { title?: string }[] | null;
      const title =
        Array.isArray(st) && st[0] ? st[0].title : st && 'title' in st ? (st as { title?: string }).title : undefined;
      currentStationTitle = title ?? null;
    }
  }

  return {
    maxStepNumber,
    totalPublishedSteps: steps.length,
    allJourneyComplete: allComplete,
    currentStationTitle,
    currentStepNumber,
    totalStations: stationCount ?? 0,
  };
}

/** מסנן Upstash לידע מערכת במסע — התקדמות + קורסים פעילים לפרימיום. */
export function buildAlmogSystemKnowledgeFilter(params: {
  maxStepNumber: number;
  enrolledCourseIds: string[];
}): string | null {
  const { maxStepNumber, enrolledCourseIds } = params;

  if (maxStepNumber <= 0 && enrolledCourseIds.length === 0) {
    return null;
  }

  const accessParts = [`accessLevel = 'public'`];
  if (enrolledCourseIds.length > 0) {
    accessParts.push(
      `(accessLevel = 'premium' AND courseId IN (${enrolledCourseIds.map(escapeFilterString).join(', ')}))`
    );
  }
  accessParts.push(`(accessLevel = 'premium' AND HAS NOT FIELD courseId)`);
  const accessClause = `(${accessParts.join(' OR ')})`;

  const stepScope = `dataType = 'step' AND stepNumber <= ${maxStepNumber}`;

  if (enrolledCourseIds.length === 0) {
    return `(${stepScope}) AND ${accessClause}`;
  }

  const inList = enrolledCourseIds.map(escapeFilterString).join(', ');
  const scope = `(${stepScope} OR (dataType = 'course' AND courseId IN (${inList})))`;
  return `${scope} AND ${accessClause}`;
}

/**
 * מסנן Upstash לעקרונות אלמוג (`dataType = 'principle'`).
 * עקרונות הם גלובליים — לא תלויים בהתקדמות המסע (בניגוד לידע step/course),
 * כך שהם נשלפים גם למשתמש חדש לגמרי. premium מותר רק למי שרשום לקורס כלשהו.
 */
export function buildAlmogPrinciplesFilter(params: {
  enrolledCourseIds: string[];
}): string {
  const hasPremiumAccess = params.enrolledCourseIds.length > 0;
  const access = hasPremiumAccess
    ? `(accessLevel = 'public' OR accessLevel = 'premium')`
    : `accessLevel = 'public'`;
  return `dataType = 'principle' AND ${access}`;
}

/**
 * בלוק העקרונות לפרומפט — חוקי תוכנית + הנחיות "איך להתמודד עם X".
 * נשלף סמנטית לפי ההודעה הנוכחית; קו מנחה מחייב להתנהלות של אלמוג.
 */
export function formatAlmogPrinciplesBlock(
  hits: Array<{ metadata?: Record<string, unknown> }>,
  topK: number
): string {
  const lines: string[] = [];
  let i = 1;
  for (const h of hits.slice(0, topK)) {
    const text = h.metadata?.text;
    if (typeof text === 'string' && text.trim()) {
      lines.push(`${i}. ${text.trim()}`);
      i += 1;
    }
  }
  if (!lines.length) return '';
  return `עקרונות והנחיות של אלמוג (חוקי התוכנית + איך להתמודד עם מצבים — קו מנחה מחייב, נשלף לפי הרלוונטיות לשיחה):\n${lines.join('\n')}`;
}

export function formatSystemKnowledgeContextBlock(
  hits: Array<{ metadata?: Record<string, unknown> }>,
  topK: number,
  opts?: { guideMode?: boolean }
): string {
  const lines: string[] = [];
  let i = 1;
  for (const h of hits.slice(0, topK)) {
    const text = h.metadata?.text;
    if (typeof text === 'string' && text.trim()) {
      const sn = h.metadata?.stepNumber;
      const st = h.metadata?.stationTitle;
      const prefix =
        typeof sn === 'number'
          ? `[צעד ${sn}${typeof st === 'string' && st ? ` · ${st}` : ''}] `
          : typeof st === 'string' && st
            ? `[פרק: ${st}] `
            : '';
      lines.push(`${i}. ${prefix}${text.trim()}`);
      i += 1;
    }
  }
  if (!lines.length) return '';
  if (opts?.guideMode) {
    return `חומר עזר מהמדריך (ממוקד לפרק הנוכחי):\n${lines.join('\n')}`;
  }
  return `חומר עזר מהמסע (רק לפי ההתקדמות של המשתמש):\n${lines.join('\n')}`;
}

/** מסנן RAG ממוקד לפרק במדריך — guides → chapters. */
export function buildGuideChapterKnowledgeFilter(params: {
  courseId: string;
  lessonId: string;
  enrolledCourseIds: string[];
}): string | null {
  const { courseId, lessonId, enrolledCourseIds } = params;
  if (!enrolledCourseIds.includes(courseId)) return null;

  const accessParts = [`accessLevel = 'public'`];
  accessParts.push(
    `(accessLevel = 'premium' AND courseId = ${escapeFilterString(courseId)})`
  );
  const accessClause = `(${accessParts.join(' OR ')})`;

  const scope = `(dataType = 'course' AND courseId = ${escapeFilterString(courseId)} AND (stationId = ${escapeFilterString(lessonId)} OR HAS NOT FIELD stationId))`;
  return `${scope} AND ${accessClause}`;
}

export async function queryAlmogSystemKnowledgeForUser(params: {
  questionEmbedding: number[];
  filter: string;
  topK: number;
}): Promise<Array<{ metadata?: Record<string, unknown> }>> {
  return querySystemKnowledgeVectors({
    vector: params.questionEmbedding,
    topK: params.topK,
    filter: params.filter,
  });
}
