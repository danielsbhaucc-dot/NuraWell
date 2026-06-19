import { describe, expect, it } from 'vitest';
import {
  formatUnansweredRecoveryForChat,
  RECOVERY_NO_REPLY_CHAT_HOURS,
  RECOVERY_NO_REPLY_ESCALATE_HOURS,
  type UnansweredRecoverySignal,
} from '../lib/ai/almog-commitments/recovery-response-detection';

describe('recovery-response-detection', () => {
  it('exports timing constants', () => {
    expect(RECOVERY_NO_REPLY_CHAT_HOURS).toBe(8);
    expect(RECOVERY_NO_REPLY_ESCALATE_HOURS).toBe(24);
  });

  it('formats chat block when user did not reply to inquiry', () => {
    const signals: UnansweredRecoverySignal[] = [
      {
        kind: 'inquiry_no_reply',
        userId: 'u1',
        taskTitle: 'לשתות מים',
        journeyTaskId: 't1',
        stepId: 's1',
        assignmentId: null,
        blockerId: null,
        sentAt: new Date().toISOString(),
        hoursSince: 8,
        severity: 'follow_up',
        bodySnippet: 'לא עדכנת על מים',
      },
    ];
    const block = formatUnansweredRecoveryForChat(signals);
    expect(block).toContain('לא ענה');
    expect(block).toContain('לשתות מים');
    expect(block).toContain('עדין');
  });

  it('returns null when no relevant signals', () => {
    expect(formatUnansweredRecoveryForChat([])).toBeNull();
    expect(
      formatUnansweredRecoveryForChat([
        {
          kind: 'inquiry_no_reply',
          userId: 'u1',
          taskTitle: 'x',
          journeyTaskId: null,
          stepId: null,
          assignmentId: null,
          blockerId: null,
          sentAt: new Date().toISOString(),
          hoursSince: 2,
          severity: 'awareness',
          bodySnippet: '',
        },
      ])
    ).toBeNull();
  });
});
