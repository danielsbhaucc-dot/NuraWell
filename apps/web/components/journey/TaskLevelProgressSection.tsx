'use client';

import { useEffect, useState } from 'react';
import type { JourneyTask } from '../../lib/types/journey';
import { computeTaskLevelProgressSnapshot, coerceTaskExecutionsFromApi } from '../../lib/journey/task-level-progress';
import { jerusalemDateKey } from '../../lib/journey/task-schedule';
import { TaskLevelProgressCard } from './TaskLevelProgressCard';

type TaskLevelProgressSectionProps = {
  task: JourneyTask;
  stepId: string;
  taskLevelMeta?: unknown;
};

export function TaskLevelProgressSection({
  task,
  stepId,
  taskLevelMeta,
}: TaskLevelProgressSectionProps) {
  const [loading, setLoading] = useState(true);
  const [executions, setExecutions] = useState<
    Array<{ task_id: string; date_key: string; slot: string; outcome?: string | null }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/task-executions?step_id=${encodeURIComponent(stepId)}&task_id=${encodeURIComponent(task.id)}&days=60`,
          { credentials: 'include' }
        );
        const data = (await res.json()) as {
          executions?: Array<{
            task_id: string;
            date_key: string;
            slot: string;
            outcome?: string | null;
          }>;
        };
        if (!cancelled && Array.isArray(data.executions)) {
          setExecutions(data.executions);
        }
      } catch {
        /* שקט — הכרטיס יוצג עם נתונים ריקים */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stepId, task.id]);

  if (!task.leveling?.levels?.length) return null;
  if (loading) return null;

  const snapshot = computeTaskLevelProgressSnapshot({
    task,
    executions: coerceTaskExecutionsFromApi(executions),
    taskLevelMeta,
    todayKey: jerusalemDateKey(),
  });

  if (!snapshot.hasLeveling) return null;

  return (
    <div className="px-3 pb-3">
      <TaskLevelProgressCard
        taskTitle={task.title}
        emoji={task.emoji || '✅'}
        stepId={stepId}
        snapshot={snapshot}
        levels={task.leveling.levels}
      />
    </div>
  );
}
