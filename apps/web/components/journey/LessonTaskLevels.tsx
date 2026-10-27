'use client';

import { useCallback, useEffect, useState } from 'react';
import { TaskLadderCard, type LadderCardTask } from '@/lib/module-api/billing/components-plans-TaskLadderCard';

/** Lesson screen: the accepted task(s) of this step, read from the unified task model (levels + ladder actions). */
export function LessonTaskLevels({ stepId }: { stepId: string }) {
  const [tasks, setTasks] = useState<LadderCardTask[] | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tasks/plan?stepId=${encodeURIComponent(stepId)}`, { credentials: 'include' });
      const json = (await res.json()) as { tasks?: LadderCardTask[] };
      setTasks(Array.isArray(json.tasks) ? json.tasks : []);
    } catch {
      setTasks([]);
    }
  }, [stepId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!tasks?.length) return null;
  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      {tasks.map((t) => (
        <TaskLadderCard key={t.id} task={t} onChanged={() => void load()} />
      ))}
    </div>
  );
}
