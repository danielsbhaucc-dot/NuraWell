'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { JourneyTask } from '../../lib/types/journey';
import { computeTaskLevelProgressSnapshot, coerceTaskExecutionsFromApi } from '../../lib/journey/task-level-progress';
import { jerusalemDateKey } from '../../lib/journey/task-schedule';
import { TaskLevelProgressCard } from './TaskLevelProgressCard';

type TaskLevelProgressStepPanelProps = {
  stepId: string;
  tasks: JourneyTask[];
  taskLevelMeta?: unknown;
};

export function TaskLevelProgressStepPanel({
  stepId,
  tasks,
  taskLevelMeta,
}: TaskLevelProgressStepPanelProps) {
  const leveled = useMemo(
    () => tasks.filter((t) => t.leveling?.levels?.length),
    [tasks]
  );
  const [loading, setLoading] = useState(true);
  const [executions, setExecutions] = useState<
    Array<{ task_id: string; date_key: string; slot: string; outcome?: string | null }>
  >([]);

  useEffect(() => {
    if (!leveled.length) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/task-executions?step_id=${encodeURIComponent(stepId)}&days=60`,
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
        /* שקט */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stepId, leveled.length]);

  if (!leveled.length) return null;

  if (loading) {
    return (
      <div className="px-3 pb-3 flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" aria-label="טוען מעקב רמות" />
      </div>
    );
  }

  const todayKey = jerusalemDateKey();

  return (
    <div className="space-y-2 px-1 pb-2">
      {leveled.map((task) => {
        const taskExecs = executions.filter((e) => e.task_id === task.id);
        const snapshot = computeTaskLevelProgressSnapshot({
          task,
          executions: coerceTaskExecutionsFromApi(taskExecs),
          taskLevelMeta,
          todayKey,
        });
        if (!snapshot.hasLeveling) return null;
        return (
          <TaskLevelProgressCard
            key={`level-${task.id}`}
            taskTitle={task.title}
            emoji={task.emoji || '✅'}
            stepId={stepId}
            snapshot={snapshot}
            levels={task.leveling?.levels}
          />
        );
      })}
    </div>
  );
}
