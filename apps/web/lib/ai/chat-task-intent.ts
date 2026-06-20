/**
 * זיהוי תגובת משתמש על משימת מסע — *7 קטגוריות מלאות*, לא רק done/none.
 *
 * שדרוג מהפרויקט המקורי:
 *   הגרסה הישנה זיהתה רק `done` (וקיפלה הכל אחר לא-דיווח). זה גרם לאלמוג
 *   לחגוג גם כשהמשתמש *לא* באמת הצליח, או להתעלם מהמשתמש שמדווח partial.
 *
 *   הגרסה הזו מסווגת ל-7 קטגוריות באמצעות `classifyResponseFast`, ומעבירה
 *   את הקטגוריה ל-`mark-task-execution.ts` ול-AI כך שהסטטוס המדויק נכתב
 *   ל-DB וה-AI מקבל הקשר טון נכון.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import {
  classifyResponseFast,
  outcomeFromCategory,
  type ResponseCategory,
  type ResponseClassification,
} from './response-classifier';
import {
  fetchPendingAcceptedTasksForUser,
  markTaskExecutionForUser,
  type PendingAcceptedTask,
} from './mark-task-execution';
import { jerusalemDateKey } from '../journey/task-schedule';
import {
  parseHintSlot,
  resolveTaskIntentWithHint,
  type TaskReportHintPayload,
} from './task-report-hint';

/** טיפוס לתאימות לאחור עם קוד שמשתמש ב-TaskIntentKind. */
export type TaskIntentKind = 'done' | 'none';

export type TaskIntentDetection = {
  kind: TaskIntentKind;
  /** קטגוריה מלאה לפי הסיווג החדש. */
  category: ResponseCategory;
  confidence: ResponseClassification['confidence'];
  source: ResponseClassification['source'];
  taskId?: string;
  taskTitle?: string;
  extractedNote?: string;
};

type TaskIntentPendingTask = Pick<PendingAcceptedTask, 'id' | 'title'>;

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

function dateKeyDaysAgo(days: number): string {
  return jerusalemDateKey(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function looksLikeYesterdayCorrection(msg: string): boolean {
  return (
    /(?:טעיתי|סליחה|התבלבלתי|בעצם|התכוונתי)/i.test(msg) &&
    /אתמול/i.test(msg) &&
    /(?:שתיתי|שתינו|שתית|עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|אכלתי|הלכתי)/i.test(msg)
  );
}

function negatesTodayInCorrection(msg: string): boolean {
  return /(?:היום[^.?!\n]{0,40}\bלא\b|\bלא\b[^.?!\n]{0,40}היום)/i.test(msg);
}

function pickTaskForCorrection(
  msg: string,
  pendingTasks: readonly PendingAcceptedTask[]
): PendingAcceptedTask | undefined {
  for (const task of pendingTasks) {
    if (messageReferencesTask(msg, task.title)) return task;
  }
  return pendingTasks.length === 1 ? pendingTasks[0] : undefined;
}

/** ממפה את 7 הקטגוריות ל-2 הישנות לצורך תאימות לאחור. */
function categoryToLegacyKind(category: ResponseCategory): TaskIntentKind {
  return category === 'done' ? 'done' : 'none';
}

/**
 * מזהה תגובת משתמש על משימה. תוצאה תמיד נחזרת.
 *
 * שינוי קריטי מהגרסה הישנה: גם partial / failed / skipped נחשבים *דיווח על
 * המשימה* — לא בהכרח "כלום". ה-AI יקבל את הקטגוריה ויטפל בה ספציפית.
 */
export function detectTaskIntent(
  userMessage: string,
  pendingTasks: readonly TaskIntentPendingTask[]
): TaskIntentDetection {
  const msg = normalizeMsg(userMessage);
  if (msg.length < 3) {
    return { kind: 'none', category: 'unknown', confidence: 'low', source: 'regex' };
  }

  if (pendingTasks.length === 0) {
    return { kind: 'none', category: 'unknown', confidence: 'low', source: 'regex' };
  }

  const classification = classifyResponseFast(msg);
  if (!classification) {
    return { kind: 'none', category: 'unknown', confidence: 'low', source: 'regex' };
  }

  const category = classification.category;

  if (category === 'question' || category === 'unknown') {
    return {
      kind: 'none',
      category,
      confidence: classification.confidence,
      source: classification.source,
      ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
    };
  }

  // נסה לאסוציאט עם משימה ספציפית מהרשימה.
  for (const t of pendingTasks) {
    if (messageReferencesTask(msg, t.title)) {
      return {
        kind: categoryToLegacyKind(category),
        category,
        confidence: classification.confidence,
        source: classification.source,
        taskId: t.id,
        taskTitle: t.title,
        ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
      };
    }
  }

  // אם יש משימה pending יחידה — בטוח להניח שזה אליה (כמו בגרסה הישנה).
  if (pendingTasks.length === 1 && classification.confidence !== 'low') {
    const only = pendingTasks[0]!;
    return {
      kind: categoryToLegacyKind(category),
      category,
      confidence: classification.confidence,
      source: classification.source,
      taskId: only.id,
      taskTitle: only.title,
      ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
    };
  }

  return {
    kind: 'none',
    category,
    confidence: 'low',
    source: classification.source,
    ...(classification.extractedNote ? { extractedNote: classification.extractedNote } : {}),
  };
}

/**
 * תוצאת `applyTaskIntentFromUserMessage` — מועשרת בנתוני סלוטים כדי שה-AI
 * יוכל לתת תגובה אנושית מותאמת על בסיס:
 *  • `schedule` — האם המשימה חד-פעמית, יומית, או רב-סלוטים.
 *  • `slot` — איזה סלוט בדיוק זה עתה סומן (אם רלוונטי).
 *  • `slotsRemainingToday` — כמה סלוטים נותרו פתוחים היום ובאיזה שמות.
 *  • `wasAlreadyDone` — המשתמש דיווח על מה שכבר היה רשום.
 *  • `category` / `extractedNote` — הסיווג המלא לטון התגובה.
 */
export type ApplyTaskIntentResult = {
  marked: boolean;
  stepId?: string;
  taskId?: string;
  taskTitle?: string;
  intent: TaskIntentDetection;
  /** הסיווג המלא — מועבר לקוד שבונה את בלוק הפרומפט. */
  category: ResponseCategory;
  schedule?: JourneyTaskSchedule;
  slot?: JourneyTaskSlot;
  totalSlotsToday?: number;
  slotsCompletedToday?: number;
  slotsRemainingToday?: JourneyTaskSlot[];
  wasAlreadyDone?: boolean;
};

/**
 * מבצע side effect מתאים לפי הקטגוריה:
 *
 *   done       → markTaskExecutionForUser עם outcome='completed' (כמו עד היום).
 *   partial    → markTaskExecutionForUser עם outcome='partial' (חדש, דורש 000031).
 *   failed     → markTaskExecutionForUser עם outcome='attempt_failed' (000030).
 *   skipped    → markTaskExecutionForUser עם outcome='skipped' (חדש, 000031).
 *   opted_out  → לא רלוונטי למשימה (משימות הן חד-פעמיות מטבען; הסירוב מטופל
 *                בשלב ה-task_statuses=rejected, לא פה). מחזירים marked=false.
 *   question / unknown → לא נכתב.
 */
export async function applyTaskIntentFromUserMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  pending?: PendingAcceptedTask[],
  hint?: TaskReportHintPayload
): Promise<ApplyTaskIntentResult> {
  const list = pending ?? (await fetchPendingAcceptedTasksForUser(supabase, userId));
  const normalizedMessage = normalizeMsg(userMessage);

  if (looksLikeYesterdayCorrection(normalizedMessage)) {
    const correctedTask = pickTaskForCorrection(normalizedMessage, list);
    if (correctedTask) {
      const intent: TaskIntentDetection = {
        kind: 'done',
        category: 'done',
        confidence: 'high',
        source: 'regex',
        taskId: correctedTask.id,
        taskTitle: correctedTask.title,
        extractedNote: 'תיקון תאריך: הביצוע שייך לאתמול',
      };
      const yesterdayResult = await markTaskExecutionForUser(supabase, userId, {
        taskId: correctedTask.id,
        userMessage,
        pending: list,
        outcome: 'completed',
        dateKey: dateKeyDaysAgo(1),
      });

      if (negatesTodayInCorrection(normalizedMessage)) {
        await markTaskExecutionForUser(supabase, userId, {
          taskId: correctedTask.id,
          userMessage,
          pending: list,
          outcome: 'skipped',
          dateKey: jerusalemDateKey(),
        });
      }

      if (yesterdayResult.ok) {
        return {
          marked: true,
          stepId: yesterdayResult.stepId,
          taskId: yesterdayResult.taskId,
          taskTitle: yesterdayResult.taskTitle,
          intent,
          category: 'done',
          schedule: yesterdayResult.schedule,
          ...(yesterdayResult.slot ? { slot: yesterdayResult.slot } : {}),
          totalSlotsToday: yesterdayResult.totalSlotsToday,
          slotsCompletedToday: yesterdayResult.slotsCompletedToday,
          slotsRemainingToday: yesterdayResult.slotsRemainingToday,
          wasAlreadyDone: yesterdayResult.wasAlreadyDone,
        };
      }
    }
  }

  const intent = resolveTaskIntentWithHint(
    userMessage,
    list,
    hint,
    detectTaskIntent(userMessage, list)
  );

  const outcome = outcomeFromCategory(intent.category);
  if (!outcome || !intent.taskId) {
    return { marked: false, intent, category: intent.category };
  }

  const hintedTask = list.find((t) => t.id === intent.taskId);
  const result = await markTaskExecutionForUser(supabase, userId, {
    taskId: intent.taskId,
    userMessage,
    pending: list,
    outcome,
    slot: parseHintSlot(hint?.slot, hintedTask),
  });

  if (!result.ok) {
    return { marked: false, intent, category: intent.category };
  }

  return {
    marked: true,
    stepId: result.stepId,
    taskId: result.taskId,
    taskTitle: result.taskTitle,
    intent: {
      ...intent,
      taskId: result.taskId,
      taskTitle: result.taskTitle,
    },
    category: intent.category,
    schedule: result.schedule,
    ...(result.slot ? { slot: result.slot } : {}),
    totalSlotsToday: result.totalSlotsToday,
    slotsCompletedToday: result.slotsCompletedToday,
    slotsRemainingToday: result.slotsRemainingToday,
    wasAlreadyDone: result.wasAlreadyDone,
  };
}
