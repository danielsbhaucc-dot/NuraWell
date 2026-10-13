import { describe, expect, it } from 'vitest';
import { closedPeriodReference, shouldRunChatSummaryTier } from '../lib/ai/chat-memory/chat-periodic-summaries';
import { israelDateKey, buildChatPeriodKey } from '../lib/ai/chat-memory/chat-period-keys';
import { shouldAutoCloseOpenSession } from '../lib/ai/chat-sessions/auto-close-stale-sessions';
import { buildCronOpsNotification } from '../lib/ai/cron-ops-action';

describe('nightly rollups summarise the period that just closed', () => {
  const at0300 = new Date('2026-10-13T00:00:00Z'); // 03:00 IL Tuesday
  it('daily at 03:00 → yesterday', () => {
    expect(israelDateKey(closedPeriodReference(at0300))).toBe('2026-10-12');
  });
  it('weekly runs Sunday night for the week that ended Saturday', () => {
    const sun0300 = new Date('2026-10-18T00:00:00Z');
    expect(shouldRunChatSummaryTier('weekly', sun0300)).toBe(true);
    expect(shouldRunChatSummaryTier('weekly', new Date('2026-10-17T00:00:00Z'))).toBe(false);
    expect(buildChatPeriodKey('weekly', closedPeriodReference(sun0300))).toBe(buildChatPeriodKey('weekly', new Date('2026-10-17T12:00:00Z')));
  });
  it('monthly on the 1st → previous month', () => {
    expect(buildChatPeriodKey('monthly', closedPeriodReference(new Date('2026-10-01T00:00:00Z')))).toBe(buildChatPeriodKey('monthly', new Date('2026-09-20T12:00:00Z')));
  });
});

describe('auto-close', () => {
  const now = Date.parse('2026-10-13T06:00:00Z');
  it('closes a session whose last user turn never got a reply for a day', () => {
    expect(shouldAutoCloseOpenSession({ lastTurnRole: 'user', lastTurnAt: new Date(now - 30 * 3600_000).toISOString(), sessionUpdatedAt: new Date(now - 30 * 3600_000).toISOString(), nowMs: now })).toBe(true);
  });
});

describe('cron_ops titles', () => {
  it('never uses the literal word "שם" when the name is unknown', () => {
    const n = buildCronOpsNotification('nudge' as never, null, 0, 'x', 10);
    if (n) expect(n.title).not.toMatch(/^שם/);
  });
});
