/**
 * guide-context-hint.ts
 * -------------------
 * הקשר מובנה מדף פרק/מדריך → צ'אט אלמוג.
 * עובר ב-body (לא בטקסט) — חוסך טוקנים ומאפשר RAG ממוקד.
 */

export type GuideContextHintSource = 'lesson_page' | 'guide_detail';

/** צד לקוח — נשלח ב-CustomEvent וב-body של הצ'אט. */
export type GuideContextHint = {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonCompleted?: boolean;
  source: GuideContextHintSource;
};

/** גוף API — snake_case */
export type GuideContextHintPayload = {
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_completed?: boolean;
  source: GuideContextHintSource;
};

export function guideContextHintToPayload(hint: GuideContextHint): GuideContextHintPayload {
  return {
    course_id: hint.courseId,
    course_title: hint.courseTitle,
    lesson_id: hint.lessonId,
    lesson_title: hint.lessonTitle,
    ...(hint.lessonCompleted !== undefined ? { lesson_completed: hint.lessonCompleted } : {}),
    source: hint.source,
  };
}

export function formatGuideContextPromptBlock(hint: GuideContextHintPayload | undefined): string | null {
  if (!hint?.lesson_id || !hint.course_id) return null;
  const done = hint.lesson_completed ? ' · הפרק מסומן כהושלם' : '';
  return `[הקשר מדריך — ממוקד]
מדריך: ${hint.course_title}
פרק נוכחי: ${hint.lesson_title}${done}
ענה רק על בסיס תוכן המדריך/פרק הזה. אם חסר מידע — אמור בכנות ואל תמציא.`;
}
