import { describe, it, expect } from 'vitest';
import {
  applyHabitMetaPatch,
  recommendHabitTargetAdjustment,
  type HabitProgressSnapshot,
} from '../lib/journey/habit-progress';

function makeSnapshot(over: Partial<HabitProgressSnapshot> = {}): HabitProgressSnapshot {
  const days = Array.from({ length: 21 }, (_, i) => ({
    dateKey: `2026-05-${(i + 1).toString().padStart(2, '0')}`,
    status: 'pending' as const,
  }));
  return {
    habitId: 'h1',
    targetDays: 14,
    streakCurrent: 0,
    streakBest: 0,
    achieved: false,
    achievedAt: null,
    recentDays: days,
    daysRemaining: 14,
    percent: 0,
    ...over,
  };
}

describe('recommendHabitTargetAdjustment', () => {
  it('no change on baseline empty state', () => {
    const r = recommendHabitTargetAdjustment(makeSnapshot());
    expect(r.kind).toBe('none');
  });

  it('marks achieved when streak reaches target', () => {
    const r = recommendHabitTargetAdjustment(
      makeSnapshot({ streakCurrent: 14, targetDays: 14 })
    );
    expect(r.kind).toBe('achieve');
    expect(r.metaPatch.achieved_at).toBeTruthy();
  });

  it('extends target when 4+ of last 7 days missed', () => {
    const days = [
      ...Array.from({ length: 13 }, (_, i) => ({
        dateKey: `2026-05-${(i + 1).toString().padStart(2, '0')}`,
        status: 'pending' as const,
      })),
      { dateKey: '2026-05-14', status: 'missed' as const },
      { dateKey: '2026-05-15', status: 'missed' as const },
      { dateKey: '2026-05-16', status: 'done' as const },
      { dateKey: '2026-05-17', status: 'missed' as const },
      { dateKey: '2026-05-18', status: 'missed' as const },
      { dateKey: '2026-05-19', status: 'done' as const },
      { dateKey: '2026-05-20', status: 'done' as const },
      { dateKey: '2026-05-21', status: 'pending' as const },
    ];
    const r = recommendHabitTargetAdjustment(
      makeSnapshot({ targetDays: 14, recentDays: days, streakCurrent: 2 })
    );
    expect(r.kind).toBe('extend');
    expect(r.newTargetDays).toBe(17);
  });

  it('shortens target when last 7 days mostly done and close to finish', () => {
    const days = [
      ...Array.from({ length: 13 }, (_, i) => ({
        dateKey: `2026-05-${(i + 1).toString().padStart(2, '0')}`,
        status: 'pending' as const,
      })),
      { dateKey: '2026-05-14', status: 'done' as const },
      { dateKey: '2026-05-15', status: 'done' as const },
      { dateKey: '2026-05-16', status: 'done' as const },
      { dateKey: '2026-05-17', status: 'done' as const },
      { dateKey: '2026-05-18', status: 'done' as const },
      { dateKey: '2026-05-19', status: 'done' as const },
      { dateKey: '2026-05-20', status: 'done' as const },
      { dateKey: '2026-05-21', status: 'pending' as const },
    ];
    /** target=14, 60%=8.4→8. streakCurrent=8 עומד בסף; 5/7 הימים האחרונים done. */
    const r = recommendHabitTargetAdjustment(
      makeSnapshot({ targetDays: 14, recentDays: days, streakCurrent: 8 })
    );
    expect(r.kind).toBe('shorten');
    expect(r.newTargetDays).toBeLessThan(14);
  });

  it('skips when user adjusted recently', () => {
    const r = recommendHabitTargetAdjustment(
      makeSnapshot({ streakCurrent: 14, targetDays: 14 }),
      { userAdjustedRecently: true }
    );
    expect(r.kind).toBe('none');
  });
});

describe('applyHabitMetaPatch', () => {
  it('creates entry for new habit', () => {
    const out = applyHabitMetaPatch({}, 'h1', { target_days: 21 });
    expect(out.h1.target_days).toBe(21);
  });

  it('preserves other habits unchanged', () => {
    const existing = {
      h1: { target_days: 14, streak_current: 0, streak_best: 0, achieved_at: null },
      h2: { target_days: 21, streak_current: 5, streak_best: 5, achieved_at: null },
    };
    const out = applyHabitMetaPatch(existing, 'h1', { target_days: 17 });
    expect(out.h1.target_days).toBe(17);
    expect(out.h2.target_days).toBe(21);
    expect(out.h2.streak_current).toBe(5);
  });

  it('merges patch on top of existing entry', () => {
    const existing = {
      h1: { target_days: 14, streak_current: 3, streak_best: 3, achieved_at: null },
    };
    const out = applyHabitMetaPatch(existing, 'h1', {
      achieved_at: '2026-05-21T10:00:00Z',
    });
    expect(out.h1.streak_current).toBe(3);
    expect(out.h1.target_days).toBe(14);
    expect(out.h1.achieved_at).toBe('2026-05-21T10:00:00Z');
  });
});
