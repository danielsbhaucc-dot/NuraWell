import { describe, expect, it } from 'vitest';
import { mergeMessage, sanitizeDecisions } from '@/lib/almog/nightly-task-merge';

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
