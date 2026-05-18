/** פריטי משימה/הרגל מתוך שדה JSON ב-journey_steps — שימוש חוזר בדיווח ובתפריט פעולות */

export function parseJourneyReportItems(raw: unknown): { id: string; title: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((x): x is { id: string; title: string } => Boolean(x));
}

export type JourneyReportStepShape = {
  id: string;
  title: string;
  step_number: number;
  tasks: unknown;
  progress: {
    task_statuses?: Record<string, { status?: string }>;
  } | null;
};

export function countTaskStatusesByReport(steps: JourneyReportStepShape[]) {
  let accepted = 0;
  let rejected = 0;
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = step.progress?.task_statuses ?? {};
    for (const t of tasks) {
      const st = ts[t.id]?.status;
      if (st === 'accepted') accepted++;
      else if (st === 'rejected') rejected++;
    }
  }
  return { accepted, rejected };
}

type TaskStatusEntry = { status?: string; execution_done?: boolean };

/** משימות שהמשתמש לקח על עצמו (accepted) — כמה בוצעו וכמה ממתינות */
export function countAcceptedTaskExecution(steps: JourneyReportStepShape[]) {
  let accepted = 0;
  let done = 0;
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = (step.progress?.task_statuses ?? {}) as Record<string, TaskStatusEntry>;
    for (const t of tasks) {
      const entry = ts[t.id];
      if (entry?.status === 'accepted') {
        accepted++;
        if (entry.execution_done) done++;
      }
    }
  }
  return { accepted, done, pending: Math.max(0, accepted - done) };
}

export type DeclinedTaskRow = {
  stepId: string;
  stepNumber: number;
  stepTitle: string;
  taskId: string;
  taskTitle: string;
};

export function listDeclinedTasksFromReport(steps: JourneyReportStepShape[]): DeclinedTaskRow[] {
  const out: DeclinedTaskRow[] = [];
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = step.progress?.task_statuses ?? {};
    for (const t of tasks) {
      if (ts[t.id]?.status === 'rejected') {
        out.push({
          stepId: step.id,
          stepNumber: step.step_number,
          stepTitle: step.title,
          taskId: t.id,
          taskTitle: t.title,
        });
      }
    }
  }
  return out.sort((a, b) => a.stepNumber - b.stepNumber || a.taskTitle.localeCompare(b.taskTitle, 'he'));
}
