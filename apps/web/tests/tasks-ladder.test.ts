import { describe, expect, it } from 'vitest';
import { consecutiveDays, resolveLadder, shouldAutoStepUp, stepDown, stepUp, STEP_UP_AFTER_SUCCESS_DAYS } from '../lib/tasks/ladder';

const water = {
  title: 'שתיית 2 כוסות מים לפני הארוחה',
  times_per_day: 3,
  floor_level: -2,
  max_level: 0,
  ladder: [
    { level: -2, title: 'כוס אחת לפני ארוחה אחת', times_per_day: 1 },
    { level: -1, title: 'כוס אחת לפני כל ארוחה', times_per_day: 3 },
    { level: 0, title: 'שתיית 2 כוסות מים לפני הארוחה', times_per_day: 3 },
  ],
};

describe('ladder', () => {
  it('steps down one level at a time and stops at the floor', () => {
    const a = stepDown(water, 0);
    expect(a).toMatchObject({ ok: true, from: 0, to: -1 });
    expect(stepDown(water, -1)).toMatchObject({ ok: true, to: -2 });
    expect(stepDown(water, -2)).toEqual({ ok: false, reason: 'at_floor' });
  });
  it('steps up but not above max_level', () => {
    expect(stepUp(water, -2)).toMatchObject({ ok: true, to: -1 });
    expect(stepUp(water, 0)).toEqual({ ok: false, reason: 'at_max' });
  });
  it('optional harder levels are allowed when max_level permits', () => {
    const harder = { ...water, max_level: 1, ladder: [...water.ladder, { level: 1, title: '2 כוסות לפני כל ארוחה ונשנוש', times_per_day: 4 }] };
    expect(stepUp(harder, 0)).toMatchObject({ ok: true, to: 1 });
  });
  it('derives a default ladder from times_per_day respecting the floor', () => {
    const l = resolveLadder({ title: 'הליכה', times_per_day: 3, floor_level: -1, max_level: 0, ladder: [] });
    expect(l.map((x) => x.level)).toEqual([-1, 0]);
    expect(l[0].times_per_day).toBe(2);
    expect(resolveLadder({ title: 'x', times_per_day: 1, floor_level: -2, max_level: 0, ladder: [] })).toHaveLength(1);
  });
});

describe('monitoring + streaks', () => {
  it('consecutive days count from today or yesterday', () => {
    expect(consecutiveDays(['2026-10-11', '2026-10-10', '2026-10-08'], '2026-10-11')).toBe(2);
    expect(consecutiveDays(['2026-10-10', '2026-10-09'], '2026-10-11')).toBe(2);
    expect(consecutiveDays(['2026-10-08'], '2026-10-11')).toBe(0);
  });
  it('auto step-up only below the original level after sustained success', () => {
    const days = Array.from({ length: STEP_UP_AFTER_SUCCESS_DAYS }, (_, i) => new Date(Date.UTC(2026, 9, 11 - i)).toISOString().slice(0, 10));
    expect(shouldAutoStepUp({ currentLevel: -1, successDaysSinceChange: days, todayKey: '2026-10-11' })).toBe(true);
    expect(shouldAutoStepUp({ currentLevel: -1, successDaysSinceChange: days.slice(1), todayKey: '2026-10-11' })).toBe(false);
    expect(shouldAutoStepUp({ currentLevel: 0, successDaysSinceChange: days, todayKey: '2026-10-11' })).toBe(false);
  });
});

import { shouldAutoStepDown } from '../lib/tasks/ladder';
describe('autonomous step-down', () => {
  it('steps down after 3 missed days in 5 with no success', () => {
    expect(shouldAutoStepDown({ missedDays: ['2026-10-09', '2026-10-10', '2026-10-11'], successDays: [], todayKey: '2026-10-11', lastLevelChangeKey: null })).toBe(true);
  });
  it('not when there was a success day, or a recent level change', () => {
    expect(shouldAutoStepDown({ missedDays: ['2026-10-09', '2026-10-10', '2026-10-11'], successDays: ['2026-10-08'], todayKey: '2026-10-11', lastLevelChangeKey: null })).toBe(false);
    expect(shouldAutoStepDown({ missedDays: ['2026-10-09', '2026-10-10', '2026-10-11'], successDays: [], todayKey: '2026-10-11', lastLevelChangeKey: '2026-10-08' })).toBe(false);
  });
});
