import type { JourneyStepProgress, JourneyStepWithProgress } from '../types/journey';

export type JourneyCourseGroup = {
  key: string;
  courseId: string | null;
  courseTitle: string;
  steps: JourneyStepWithProgress[];
};

/** נוסף בשרת מתוך join ל-courses(title) */
export type JourneyStepWithCourseDisplay = JourneyStepWithProgress & {
  courseDisplayTitle?: string | null;
};

function stepCourseKey(courseId: string | null | undefined): string {
  return courseId ?? '__general__';
}

export function groupJourneyStepsByCourse(steps: JourneyStepWithCourseDisplay[]): JourneyCourseGroup[] {
  const map = new Map<string, JourneyCourseGroup>();

  for (const step of steps) {
    const key = stepCourseKey(step.course_id);
    const title = (step.courseDisplayTitle ?? '').trim() || 'מסע כללי';

    if (!map.has(key)) {
      map.set(key, {
        key,
        courseId: step.course_id ?? null,
        courseTitle: title,
        steps: [],
      });
    }
    const g = map.get(key)!;
    if (title !== 'מסע כללי') {
      g.courseTitle = title;
    }
    g.steps.push(step);
  }

  for (const g of map.values()) {
    g.steps.sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  }

  return [...map.values()].sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, 'he'));
}

export function pickInitialJourneyGroupKey(
  groups: JourneyCourseGroup[],
  progressRows: Array<JourneyStepProgress & { updated_at?: string }>
): string {
  if (!groups.length) return '';

  const stepIdToGroupKey = new Map<string, string>();
  for (const g of groups) {
    for (const s of g.steps) {
      stepIdToGroupKey.set(s.id, g.key);
    }
  }

  const sorted = [...progressRows].sort(
    (a, b) =>
      new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
  );
  for (const p of sorted) {
    const k = stepIdToGroupKey.get(p.step_id);
    if (k) return k;
  }

  for (const g of groups) {
    const hasIncomplete = g.steps.some((s) => !s.progress?.is_completed);
    if (hasIncomplete) return g.key;
  }

  return groups[0]!.key;
}
