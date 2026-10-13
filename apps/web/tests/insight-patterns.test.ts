import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { daysUntilWeekday, detectPatternCandidates, israelParts, type BehaviourEvent } from '../lib/ai/insights/patterns/detect';
import { hasPlaceholderCorruption, isStorableMemoryText } from '../lib/ai/safety/memory-text-guard';

// Saturdays 2026-09-19, 09-26, 10-03 at 21:00 IL (18:00Z); a Tuesday done
const sat = (d: string, h = '18') => `${d}T${h}:00:00Z`;
const events: BehaviourEvent[] = [
  { at: sat('2026-09-19'), kind: 'sos' },
  { at: sat('2026-09-26'), kind: 'missed' },
  { at: sat('2026-10-03'), kind: 'sos' },
  { at: sat('2026-10-03', '19'), kind: 'missed' },
  { at: '2026-09-22T06:00:00Z', kind: 'missed' },
  { at: '2026-09-22T07:00:00Z', kind: 'done' },
];

describe('pattern detection', () => {
  it('israelParts uses Israel time', () => {
    expect(israelParts('2026-10-10T22:30:00Z')).toMatchObject({ dateKey: '2026-10-11', weekday: 0, hour: 1 });
  });
  it('finds hard Saturdays with dated evidence on ≥2 dates', () => {
    const c = detectPatternCandidates(events);
    const satc = c.find((x) => x.key === 'hard_weekday_6');
    expect(satc).toBeDefined();
    expect(satc!.evidenceDates).toEqual(['2026-09-19', '2026-09-26', '2026-10-03']);
    expect(satc!.summaryHe).toMatch(/שבת/);
  });
  it('finds hard evenings', () => {
    expect(detectPatternCandidates(events).some((x) => x.key === 'hard_daypart_evening')).toBe(true);
  });
  it('one bad day is not a pattern', () => {
    const one = [0, 1, 2].map((i) => ({ at: `2026-10-03T1${i}:00:00Z`, kind: 'sos' as const }));
    expect(detectPatternCandidates(one).filter((c) => c.kind === 'hard_weekday')).toEqual([]);
  });
  it('daysUntilWeekday (Fri → Sat = 1)', () => {
    expect(daysUntilWeekday(6, new Date('2026-10-16T09:00:00Z'))).toBe(1);
  });
});

describe('memory text guard', () => {
  it('rejects anonymiser placeholders seen in prod', () => {
    expect(hasPlaceholderCorruption('דניאל מרגיש [PERSON_NAME] לאחר ששכח לשתות מים.')).toBe(true);
    expect(hasPlaceholderCorruption('חום, [ADDRESS], חולשה')).toBe(true);
    expect(isStorableMemoryText('דניאל מתקשה בשבתות בערב')).toBe(true);
  });
});
