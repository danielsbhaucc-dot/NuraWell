/**
 * זיהוי ביצוע משימת מסע מהצ'אט.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import {
  fetchPendingAcceptedTasksForUser,
  markTaskExecutionForUser,
  type PendingAcceptedTask,
} from './mark-task-execution';

export type TaskIntentKind = 'done' | 'none';

export type TaskIntentDetection = {
  kind: TaskIntentKind;
  taskId?: string;
  taskTitle?: string;
};

type TaskIntentPendingTask = Pick<PendingAcceptedTask, 'id' | 'title'>;

const TASK_NOT_DONE_RE =
  /(?:לא\s+(?:עשיתי|ביצעתי|הספקתי)|עדיין\s+לא|שכחתי|אעשה\s+מחר|מחר\s+אעשה)/i;

const TASK_DONE_RE =
  /(?:עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|סגרתי|בוצע|כבר\s+עשיתי)(?:\s+את)?(?:\s+ה)?(?:משימה|המשימה|מה\s+שהתחייבתי|זה)?|סיימתי\s+את\s+ה|(?:שתיתי|שתינו|שתית)\s+(?:כוס(?:ות)?\s+)?מים|כוס(?:ות)?\s+מים\s+(?:שתיתי|בוצע|סגור)/i;

const WATER_TASK_TITLE_RE = /מים|שתייה|לשתות|כוס/i;

function normalizeMsg(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function messageReferencesTask(msg: string, title: string): boolean {
  if (WATER_TASK_TITLE_RE.test(title) && /מים|שתיתי|שתינו|שתית|כוס/i.test(msg)) {
    return true;
  }
  const kws = title
    .split(/[\s,·\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return kws.some((kw) => msg.includes(kw));
}

export function detectTaskIntent(
  userMessage: string,
  pendingTasks: readonly TaskIntentPendingTask[]
): TaskIntentDetection {
  const msg = normalizeMsg(userMessage);
  if (msg.length < 5 || pendingTasks.length === 0) return { kind: 'none' };
  if (TASK_NOT_DONE_RE.test(msg)) return { kind: 'none' };
  if (!TASK_DONE_RE.test(msg)) {
    const anyRef = pendingTasks.some((t) => messageReferencesTask(msg, t.title));
    if (!anyRef || pendingTasks.length !== 1) return { kind: 'none' };
  }

  for (const t of pendingTasks) {
    if (messageReferencesTask(msg, t.title)) {
      return { kind: 'done', taskId: t.id, taskTitle: t.title };
    }
  }

  if (TASK_DONE_RE.test(msg) && pendingTasks.length === 1) {
    const t = pendingTasks[0]!;
    return { kind: 'done', taskId: t.id, taskTitle: t.title };
  }

  return { kind: 'none' };
}

/**
 * תוצאת `applyTaskIntentFromUserMessage` — מועשרת בנתוני סלוטים כדי שה-AI
 * יוכל לתת תגובה אנושית מותאמת ("אלוף!" / "וגם בערב?") על בסיס:
 *  • `schedule` — האם המשימה חד-פעמית, יומית, או רב-סלוטים.
 *  • `slot` — איזה סלוט בדיוק זה עתה סומן (אם רלוונטי).
 *  • `slotsRemainingToday` — כמה סלוטים נותרו פתוחים היום ובאיזה שמות.
 *  • `wasAlreadyDone` — המשתמש דיווח על מה שכבר היה רשום (אין שגיאה,
 *    רק "תזכורת חיובית" שזה כבר סגור).
 */
export type ApplyTaskIntentResult = {
  marked: boolean;
  stepId?: string;
  taskId?: string;
  taskTitle?: string;
  intent: TaskIntentDetection;
  schedule?: JourneyTaskSchedule;
  slot?: JourneyTaskSlot;
  totalSlotsToday?: number;
  slotsCompletedToday?: number;
  slotsRemainingToday?: JourneyTaskSlot[];
  wasAlreadyDone?: boolean;
};

export async function applyTaskIntentFromUserMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  pending?: PendingAcceptedTask[]
): Promise<ApplyTaskIntentResult> {
  const list = pending ?? (await fetchPendingAcceptedTasksForUser(supabase, userId));
  const intent = detectTaskIntent(userMessage, list);

  if (intent.kind !== 'done') {
    return { marked: false, intent };
  }

  const result = await markTaskExecutionForUser(supabase, userId, {
    taskId: intent.taskId,
    userMessage,
    pending: list,
  });

  if (!result.ok) {
    return { marked: false, intent };
  }

  return {
    marked: true,
    stepId: result.stepId,
    taskId: result.taskId,
    taskTitle: result.taskTitle,
    intent: {
      kind: 'done',
      taskId: result.taskId,
      taskTitle: result.taskTitle,
    },
    schedule: result.schedule,
    ...(result.slot ? { slot: result.slot } : {}),
    totalSlotsToday: result.totalSlotsToday,
    slotsCompletedToday: result.slotsCompletedToday,
    slotsRemainingToday: result.slotsRemainingToday,
    wasAlreadyDone: result.wasAlreadyDone,
  };
}
