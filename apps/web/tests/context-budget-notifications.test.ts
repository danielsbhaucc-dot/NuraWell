import { describe, expect, it } from 'vitest';
import { budgetContextSectionsV2 } from '@/lib/ai/context-budget-v2';
import { formatAlmogNotificationsPromptBlock, type AlmogNotificationRecord } from '@/lib/ai/almog-notification-memory';

const rec = (i: number, body: string, extra: Partial<AlmogNotificationRecord> = {}): AlmogNotificationRecord =>
  ({ id: `n${i}`, title: '', body, source: 'nudge', sourceLabel: 'תזכורת', sentAt: '', sentAtLabel: `יום ${i}`, isRead: false, isSent: true, userRepliedAfter: false, ...extra }) as AlmogNotificationRecord;

describe('notifications prompt block', () => {
  it('dedupes, caps to newest 8, keeps highlighted', () => {
    const recs = [rec(0, 'שתית מים?'), rec(1, 'שתית מים?'), ...Array.from({ length: 20 }, (_, i) => rec(i + 2, `הודעה ${i} ${'x'.repeat(200)}`))];
    recs.push(rec(99, 'ההתראה הישנה שהמשתמש עונה עליה'));
    const out = formatAlmogNotificationsPromptBlock(recs, { highlightNotificationId: 'n99' })!;
    expect(out).toContain('×2');
    expect(out).toContain('← מגיבים עכשיו');
    expect(out).toContain('ההתראה הישנה');
    expect(out).toMatch(/\+\d+ התראות ישנות/);
    expect(out.length).toBeLessThan(2200);
  });
});

describe('budget v2', () => {
  it('trims notifications block (no longer falsely protected)', () => {
    const notif = `[התראות שאלמוג שלח — x] [מענה להתראה] ${'א\n'.repeat(3000)}`;
    const r = budgetContextSectionsV2([notif]);
    expect(r.trimmed).toBe(1);
    expect(r.after).toBeLessThan(2300);
  });
  it('keeps real protected sections', () => {
    const s = `[מענה להתראה — הקשר] ${'א'.repeat(5000)}`;
    expect(budgetContextSectionsV2([s]).sections[0]).toBe(s);
  });
});
