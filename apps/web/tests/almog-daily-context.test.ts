import { describe, expect, it } from 'vitest';

import {
  formatDailyShortTermBlock,
  isHabitMarkedDoneToday,
  mergeHabitsDoneTodayFromRows,
  shouldSkipNotifyForTouchFatigue,
} from '../lib/ai/almog-daily-context';
import type { TodayAlmogTouch } from '../lib/ai/almog-notify-day-context';

describe('almog-daily-context', () => {
  it('detects habit done from progress array', () => {
    expect(isHabitMarkedDoneToday([true])).toBe(true);
    expect(isHabitMarkedDoneToday([])).toBe(false);
    expect(isHabitMarkedDoneToday([false])).toBe(false);
  });

  it('merges habits done from most recent row first', () => {
    const done = mergeHabitsDoneTodayFromRows([
      { updated_at: '2026-05-19T08:00:00Z', habits_progress: { a: [true] } },
      { updated_at: '2026-05-19T10:00:00Z', habits_progress: { a: [], b: [true] } },
    ]);
    expect([...done].sort()).toEqual(['b']);
  });

  it('formats daily block with chat and touches', () => {
    const block = formatDailyShortTermBlock({
      chatTurns: [{ role: 'user', snippet: 'אני בלוויה היום', createdAt: 'x' }],
      todayTouches: [
        {
          slot: 'morning',
          slotLabel: 'בוקר',
          bodySnippet: 'היי',
          sentAt: 'x',
          userRepliedSince: true,
        },
      ],
      aiContext: { main_blocker: 'עומס רגשי' },
    });
    expect(block).toContain('לוויה');
    expect(block).toContain('חסם:');
    expect(block).toContain('מגעים:');
  });

  it('guards chat from continuing previous touches as implicit action', () => {
    const block = formatDailyShortTermBlock({
      todayTouches: [
        {
          slot: 'morning',
          slotLabel: 'בוקר',
          bodySnippet: 'בוא מתחילים מחדש ממחר',
          sentAt: 'x',
          userRepliedSince: false,
        },
      ],
    });
    expect(block).toContain('מגעים קודמים אינם הוראת פעולה');
    expect(block).toContain('אל תציע "מתחילים מחדש" בלי בקשה מפורשת');
  });

  it('skips remind only after heavy unanswered fatigue but not reinforce', () => {
    const touches: TodayAlmogTouch[] = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      slot: 'morning',
      slotLabel: 'בוקר',
      bodySnippet: `m${i}`,
      sentAt: `2026-05-19T0${i}:00:00Z`,
      userRepliedSince: false,
    }));
    expect(shouldSkipNotifyForTouchFatigue(touches, 'remind')).toBe(true);
    expect(shouldSkipNotifyForTouchFatigue(touches, 'reinforce')).toBe(false);
    expect(shouldSkipNotifyForTouchFatigue(touches.slice(0, 3), 'remind')).toBe(false);
  });
});
