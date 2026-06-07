import { describe, it, expect } from 'vitest';
import { normalizeTaskLeveling } from '../lib/admin/ai-fill-leveling';
import { journeyStepInsertSchema } from '../lib/validation/admin-journey-step';
import {
  computeTaskLevelProgressSnapshot,
  isTaskLevelAtOrAboveRecommended,
  recommendTaskLevelAdjustment,
} from '../lib/journey/task-level-progress';
import type { JourneyTask } from '../lib/types/journey';

describe('normalizeTaskLeveling', () => {
  it('returns null when fewer than 2 levels', () => {
    const r = normalizeTaskLeveling(
      {
        levels: [{ id: 'a', label: 'רמה', description: '', order: 0 }],
        start_level_id: 'a',
        recommended_level_id: 'a',
        level_up_after_success_days: 7,
        allow_user_downgrade: true,
        allow_user_upgrade: true,
      },
      () => 'gen-id'
    );
    expect(r).toBeNull();
  });

  it('normalizes valid leveling with defaults', () => {
    const r = normalizeTaskLeveling(
      {
        levels: [
          { id: 'easy', label: 'קל', description: 'd', order: 0 },
          { id: 'hard', label: 'קשה', description: 'd', order: 1, is_recommended: true },
        ],
        start_level_id: 'easy',
        recommended_level_id: 'hard',
        level_up_after_success_days: 5,
        allow_user_downgrade: true,
        allow_user_upgrade: true,
      },
      () => 'gen-id'
    );
    expect(r?.levels).toHaveLength(2);
    expect(r?.start_level_id).toBe('easy');
    expect(r?.recommended_level_id).toBe('hard');
    expect(r?.level_up_after_success_days).toBe(5);
  });
});

describe('journeyStepInsertSchema leveling', () => {
  it('accepts task with leveling', () => {
    const parsed = journeyStepInsertSchema.safeParse({
      title: 'צעד',
      tasks: [
        {
          id: 't1',
          title: 'מים',
          description: null,
          emoji: '💧',
          leveling: {
            levels: [
              { id: 'l0', label: 'כוס', description: '', order: 0 },
              { id: 'l1', label: '2 כוסות', description: '', order: 1, is_recommended: true },
            ],
            start_level_id: 'l0',
            recommended_level_id: 'l1',
            level_up_after_success_days: 7,
            allow_user_downgrade: true,
            allow_user_upgrade: true,
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

const waterTask: JourneyTask = {
  id: 'water',
  title: 'מים',
  description: null,
  emoji: '💧',
  schedule: 'daily',
  leveling: {
    levels: [
      { id: 'l0', label: 'כוס', description: '', order: 0 },
      { id: 'l1', label: '2 כוסות', description: '', order: 1, is_recommended: true },
    ],
    start_level_id: 'l0',
    recommended_level_id: 'l1',
    level_up_after_success_days: 3,
    allow_user_downgrade: true,
    allow_user_upgrade: true,
  },
};

describe('computeTaskLevelProgressSnapshot', () => {
  it('suggests level up after enough success days', () => {
    const executions = [
      { task_id: 'water', date_key: '2026-06-05', slot: 'full_day' as const, outcome: 'completed' },
      { task_id: 'water', date_key: '2026-06-06', slot: 'full_day' as const, outcome: 'completed' },
      { task_id: 'water', date_key: '2026-06-07', slot: 'full_day' as const, outcome: 'completed' },
    ];
    const snap = computeTaskLevelProgressSnapshot({
      task: waterTask,
      executions,
      todayKey: '2026-06-07',
      historyDays: 7,
    });
    expect(snap.shouldSuggestLevelUp).toBe(true);
    expect(snap.nextLevelId).toBe('l1');
  });

  it('recommended streak only counts at or above recommended level', () => {
    const snap = computeTaskLevelProgressSnapshot({
      task: waterTask,
      executions: [
        { task_id: 'water', date_key: '2026-06-07', slot: 'full_day', outcome: 'completed' },
      ],
      taskLevelMeta: {
        water: {
          current_level_id: 'l0',
          recommended_level_id: 'l1',
          started_level_id: 'l0',
          current_level_started_at: '2026-06-01T00:00:00.000Z',
          last_feedback: null,
          last_feedback_at: null,
          success_streak_current_level: 1,
          success_days_current_level: 1,
          best_level_id: 'l0',
          reached_recommended_at: null,
          recommended_streak_current: 0,
          recommended_streak_best: 0,
          level_up_suggested_at: null,
          level_up_declined_at: null,
        },
      },
      todayKey: '2026-06-07',
    });
    expect(snap.habitStreakAnyLevel).toBeGreaterThanOrEqual(1);
    expect(snap.habitStreakRecommendedLevel).toBe(0);
    expect(isTaskLevelAtOrAboveRecommended(waterTask.leveling!, 'l0')).toBe(false);
  });
});

describe('recommendTaskLevelAdjustment', () => {
  it('records too_easy feedback', () => {
    const snap = computeTaskLevelProgressSnapshot({
      task: waterTask,
      executions: [],
      todayKey: '2026-06-07',
    });
    const adj = recommendTaskLevelAdjustment(snap, waterTask, 'too_easy');
    expect(adj.metaPatch.last_feedback).toBe('too_easy');
  });
});
