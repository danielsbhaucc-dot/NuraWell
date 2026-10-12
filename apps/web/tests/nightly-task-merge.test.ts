import { describe, expect, it } from 'vitest';
import { mergeMessage, sanitizeDecisions } from '@/lib/almog/nightly-task-merge';

const c = [
  { id: 'a', title: 'x', level: 0, main: true, source: 'step', done: 15 },
  { id: 'b', title: 'y', level: 1, main: false, source: 'almog', done: 0 },
  { id: 'c', title: 'z', level: 0, main: false, source: 'almog', done: 0 },
];
describe('nightly task merge', () => {
  it('drops unknown ids and never drops the main task', () => {
    expect(sanitizeDecisions({ merges: [{ keep: 'b', drop: ['a', 'c', 'zzz'] }] }, c)).toEqual([{ keep: 'a', drop: ['c', 'b'], reason: undefined }]);
  });
  it('ignores garbage', () => {
    expect(sanitizeDecisions(null, c)).toEqual([]);
    expect(sanitizeDecisions({ merges: [{ keep: 'a', drop: [] }] }, c)).toEqual([]);
  });
  it('factual message', () => {
    const b = mergeMessage('דניאל', 3, { title: 'לשתות כוס מים לפני כל ארוחה', stage: 2 }).body;
    expect(b).toContain('היי דניאל, שמתי לב שהיו לך 4 משימות כמעט זהות');
    expect(b).toContain('"לשתות כוס מים לפני כל ארוחה" (שלב 2)');
  });
});
