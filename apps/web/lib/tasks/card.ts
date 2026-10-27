import type { LadderCardTask } from '@/lib/module-api/billing/components-plans-TaskLadderCard';
import type { PlanTask } from './index';
import { resolveLadder } from './ladder';

/** One mapping for every screen that renders a task on its ladder (/plans, lesson screen). */
export function toLadderCardTask(t: PlanTask): LadderCardTask {
  return {
    id: t.id,
    title: t.level.title,
    emoji: t.definition.emoji,
    isMain: t.is_main,
    currentLevel: t.current_level,
    levels: resolveLadder(t.definition).filter((l) => l.level >= t.definition.floor_level && l.level <= t.definition.max_level),
    floorLevel: t.definition.floor_level,
    doneToday: t.doneToday,
    targetToday: t.targetToday,
    streakDays: t.streakDays,
    canStepDown: t.canStepDown,
    canStepUp: t.canStepUp,
  };
}
