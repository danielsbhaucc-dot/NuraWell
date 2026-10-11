import { describe, expect, it } from 'vitest';
import { detectLevelIntent } from '../lib/tasks/chat-intent';

const tasks = ['שתיית 2 כוסות מים לפני הארוחה', 'הליכה של 10 דקות'];
describe('detectLevelIntent', () => {
  it('explicit easier request on a named task', () => {
    expect(detectLevelIntent('המשימה של המים ממש קשה לי השבוע, תוריד לי אותה רמה אחת בבקשה', tasks)).toEqual({ direction: 'easier', targetIndex: 0 });
    expect(detectLevelIntent('ההליכה קשה לי מדי', tasks)).toEqual({ direction: 'easier', targetIndex: 1 });
  });
  it('explicit harder request', () => {
    expect(detectLevelIntent('המשימה של המים קלה לי, אפשר להעלות רמה?', tasks)?.direction).toBe('harder');
  });
  it('emotional difficulty without a task does not trigger', () => {
    expect(detectLevelIntent('קשה לי היום בעבודה', tasks)).toBeNull();
    expect(detectLevelIntent('תוריד את המוזיקה', tasks)).toBeNull();
    expect(detectLevelIntent('מה המשימה הראשית שלי?', tasks)).toBeNull();
  });
});
