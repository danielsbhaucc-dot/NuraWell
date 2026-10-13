import { describe, expect, it } from 'vitest';
import { behaviorOf, foldOneTimeByBehavior, mergeMessage, sanitizeDecisions } from '@/lib/almog/nightly-task-merge';

const ladder = [
  { level: -2, title: 'כוס מים אחת לפני ארוחה אחת ביום' },
  { level: -1, title: 'כוס מים אחת לפני כל ארוחה' },
  { level: 0, title: 'שתיית 2 כוסות מים לפני הארוחה' },
];
const c = [
  { id: 'a', title: 'שתיית 2 כוסות מים לפני הארוחה', level: 0, main: true, source: 'step', done: 15, ladder },
  { id: 'b', title: 'לשתות חצי כוס מים', level: 1, main: false, source: 'almog', done: 0 },
  { id: 'c', title: 'לשתות כוס מים קטנה לפני השינה', level: 0, main: false, source: 'almog', done: 0 },
];
describe('nightly task merge', () => {
  it('drops unknown ids and never drops the main task', () => {
    expect(sanitizeDecisions({ merges: [{ keep: 'b', drop: ['a', 'c', 'zzz'] }] }, c)).toEqual([{ keep: 'a', drop: ['c', 'b'], reason: undefined }]);
  });
  it('ignores garbage', () => {
    expect(sanitizeDecisions(null, c)).toEqual([]);
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: [] }] }, c)).toEqual([]);
  });
  it('accepts a ladder level of the kept task only', () => {
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: ['b', 'c'], level: -2, reason: 'גרסה קלה' }] }, c)[0]).toEqual({ keep: 'a', drop: ['b', 'c'], level: -2, reason: 'גרסה קלה' });
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: ['b'], level: -7 }] }, c)[0].level).toBeUndefined();
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: ['b'], level: 0 }] }, c)[0].level).toBeUndefined();
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: ['b'], level: '-1' }] }, c)[0].level).toBe(-1);
  });
  it('describes an easier step of the main task', () => {
    const b = mergeMessage('דניאל', 2, { title: 'כוס מים אחת לפני ארוחה אחת ביום', stage: 1, mainTitle: 'שתיית 2 כוסות מים לפני הארוחה' }, { fromLevel: 0, toLevel: -2, mergedTitles: ['לשתות חצי כוס מים', 'לשתות כוס מים קטנה לפני השינה'] }).body;
    expect(b).toContain('היי דניאל, "לשתות חצי כוס מים" ו-"לשתות כוס מים קטנה לפני השינה" היו בעצם גרסה קלה יותר של המשימה "שתיית 2 כוסות מים לפני הארוחה"');
    expect(b).toContain('לשלב קל יותר: "כוס מים אחת לפני ארוחה אחת ביום" (שלב 1)');
  });
  it('same-habit message without level change', () => {
    const b = mergeMessage('דניאל', 3, { title: 'לשתות כוס מים לפני כל ארוחה', stage: 2 }).body;
    expect(b).toContain('היי דניאל, היו לך 4 משימות על אותו הרגל, אז איחדתי הכול למשימה אחת');
    expect(b).toContain('"לשתות כוס מים לפני כל ארוחה" (שלב 2)');
  });
});

describe('fold one-time tasks by behavior', () => {
  const cands = [
    { id: 'main', title: 'שתיית 2 כוסות מים לפני הארוחה', level: 0, main: true, source: 'step', done: 3, habit: 'water', schedule: 'per_meal', ladder },
    { id: 'half', title: 'לשתות חצי כוס מים', level: 0, main: false, source: 'almog', done: 0, habit: 'h1', schedule: 'one_time' },
    { id: 'bed', title: 'לשתות כוס מים קטנה לפני השינה', level: 0, main: false, source: 'almog', done: 0, habit: 'h1', schedule: 'one_time' },
    { id: 'rest', title: 'לתת לעצמך רשות לסגור את היום בלי שיפוטיות וללכת לישון', level: 0, main: false, source: 'almog', done: 0, habit: 'almog:x', schedule: 'one_time' },
    { id: 'why', title: 'בוא נזכיר לעצמנו במשפט אחד למה זה חשוב לך', level: 0, main: false, source: 'ai_daily', done: 0, habit: 'ai_daily:x' },
  ];
  it('classifies water before sleep', () => {
    expect(behaviorOf(cands[2])).toBe('water');
    expect(behaviorOf(cands[3])).toBe('sleep');
  });
  it('folds one-time water tasks into the main task even if the model skipped them', () => {
    expect(foldOneTimeByBehavior([], cands)).toEqual([{ keep: 'main', drop: ['half', 'bed'], reason: expect.any(String) }]);
  });
  it('extends the model decision and keeps its level; leaves other behaviors alone', () => {
    const out = foldOneTimeByBehavior([{ keep: 'main', drop: ['half'], level: -2 }], cands);
    expect(out).toEqual([{ keep: 'main', drop: ['half', 'bed'], level: -2 }]);
  });
  it('no recurring task for the behavior → nothing folded', () => {
    expect(foldOneTimeByBehavior([], cands.filter((c) => c.id !== 'main'))).toEqual([]);
  });
});

describe('behavior guard', () => {
  it('never merges a sleep task into a water task', async () => {
    const { sanitizeDecisions } = await import('@/lib/almog/nightly-task-merge');
    const cands = [
      { id: 'w', title: 'שתיית 2 כוסות מים לפני הארוחה', level: -2, main: true, source: 'step', done: 3 },
      { id: 's', title: 'לתת לעצמך רשות לסגור את היום בלי שיפוטיות וללכת לישון', level: 0, main: false, source: 'almog', done: 0, schedule: 'one_time' },
      { id: 'w2', title: 'לשתות חצי כוס מים', level: 0, main: false, source: 'almog', done: 1 },
      { id: 'x', title: 'משימה כללית', level: 0, main: false, source: 'almog', done: 0 },
    ];
    const d = sanitizeDecisions({ merges: [{ keep: 'w', drop: ['s', 'w2', 'x'] }] }, cands);
    expect(d).toEqual([{ keep: 'w', drop: ['w2'], reason: undefined }]);
    expect(sanitizeDecisions({ merges: [{ keep: 'w', drop: ['s'] }] }, cands)).toEqual([]);
  });
});
