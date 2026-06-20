/**
 * task-report-hint.ts
 * -----------------
 * הקשר מובנה לדיווח משימה ממסך הבית → צ'אט.
 * עובר ב-body (לא בטקסט המשתמש) — חוסך טוקנים ומונע טעויות שיוך.
 */

import type { TaskIntentDetection } from './chat-task-intent';
import { classifyResponseFast } from './response-classifier-fast';
import type { PendingTaskTodayRow } from '../journey/journey-report-parse';
import type { JourneyTaskSlot } from '../types/journey';
import { slotsForSchedule } from '../journey/task-schedule';
import type { PendingAcceptedTask } from './mark-task-execution';

export type TaskReportHintSource = 'home_tasks_popup' | 'home_hero' | 'sos_moment';

/** צד לקוח — נשלח ב-CustomEvent וב-body של הצ'אט. */
export type TaskReportHint = {
  taskId: string;
  taskTitle: string;
  stepId?: string;
  /** מפתח סלוט (לא label עברי) — חוסך infer מהודעה */
  slot?: JourneyTaskSlot | 'once';
  source: TaskReportHintSource;
  category?: 'done';
};

/** גוף API — snake_case */
export type TaskReportHintPayload = {
  task_id: string;
  task_title: string;
  step_id?: string;
  slot?: string;
  source: TaskReportHintSource;
  category?: 'done';
};

const DONE_MSG_RE =
  /(?:עשיתי|ביצעתי|סיימתי|הצלחתי|סגרתי|בוצע|כבר\s+עשיתי|שתיתי|שתינו|שתית)/i;

const VALID_SLOTS = new Set<string>([
  'morning',
  'noon',
  'afternoon',
  'evening',
  'night',
  'meal_breakfast',
  'meal_lunch',
  'meal_dinner',
  'meal_snack',
  'once',
]);

export function taskReportHintToPayload(hint: TaskReportHint): TaskReportHintPayload {
  return {
    task_id: hint.taskId,
    task_title: hint.taskTitle,
    ...(hint.stepId ? { step_id: hint.stepId } : {}),
    ...(hint.slot ? { slot: hint.slot } : {}),
    source: hint.source,
    ...(hint.category ? { category: hint.category } : {}),
  };
}

export function buildTaskReportHintFromPendingRow(
  task: PendingTaskTodayRow,
  source: TaskReportHintSource
): TaskReportHint {
  const firstSlot = task.pendingSlots[0];
  return {
    taskId: task.id,
    taskTitle: task.title,
    stepId: task.stepId,
    ...(firstSlot && firstSlot !== 'once' ? { slot: firstSlot as JourneyTaskSlot } : {}),
    source,
    category: 'done',
  };
}

export function parseHintSlot(
  raw: string | undefined,
  task?: Pick<PendingAcceptedTask, 'schedule' | 'times_per_day'>
): JourneyTaskSlot | undefined {
  if (!raw || raw === 'once' || !VALID_SLOTS.has(raw)) return undefined;
  const slot = raw as JourneyTaskSlot;
  if (!task) return slot;
  const allowed = slotsForSchedule(task.schedule, task.times_per_day);
  return allowed.includes(slot) ? slot : undefined;
}

/**
 * משלב hint מובנה עם זיהוי regex — hint מנצח רק כשההודעה באמת דיווח (done/partial)
 * או כשהמשתמש שלח את ה-prefill מהבית בלי לערוך.
 */
export function resolveTaskIntentWithHint(
  userMessage: string,
  pendingTasks: readonly Pick<PendingAcceptedTask, 'id' | 'title'>[],
  hint: TaskReportHintPayload | undefined,
  baseIntent: TaskIntentDetection
): TaskIntentDetection {
  if (!hint?.task_id) return baseIntent;

  const task = pendingTasks.find((t) => t.id === hint.task_id);
  if (!task) return baseIntent;

  const msg = userMessage.replace(/\s+/g, ' ').trim();
  const classification = classifyResponseFast(msg);
  const category = classification?.category;

  if (category === 'failed' || category === 'skipped' || category === 'opted_out') {
    return {
      ...baseIntent,
      taskId: task.id,
      taskTitle: task.title,
      category,
      confidence: classification?.confidence ?? 'medium',
      source: classification?.source ?? 'regex',
      extractedNote: classification?.extractedNote,
    };
  }

  const fromHome =
    hint.source === 'home_tasks_popup' ||
    hint.source === 'home_hero' ||
    hint.source === 'sos_moment';
  const looksLikeReport =
    category === 'done' ||
    category === 'partial' ||
    (fromHome && hint.category === 'done' && (DONE_MSG_RE.test(msg) || msg.includes('«')));

  if (!looksLikeReport) return baseIntent;

  return {
    kind: category === 'partial' ? 'none' : 'done',
    category: category && category !== 'unknown' && category !== 'question' ? category : 'done',
    confidence: 'high',
    source: 'regex',
    taskId: task.id,
    taskTitle: task.title,
    extractedNote: fromHome ? 'דיווח ממסך הבית' : classification?.extractedNote,
  };
}
