import { describe, expect, it } from 'vitest';
import { pickProposalToShow, type TaskProposalRow } from '../lib/ai/chat-ui/task-proposals';

const now = Date.parse('2026-10-12T12:00:00Z');
const row = (o: Partial<TaskProposalRow>): TaskProposalRow => ({
  id: 'a', title: 'הליכה של 10 דקות אחרי ארוחת ערב', status: 'pending', shown_count: 0, shown_at: null,
  created_at: '2026-10-12T10:00:00Z', ...o,
});

describe('pickProposalToShow', () => {
  it('shows the oldest pending proposal', () => {
    expect(pickProposalToShow([row({ id: 'b', created_at: '2026-10-12T11:00:00Z' }), row({})], [], now)?.id).toBe('a');
  });
  it('respects the cooldown after any card', () => {
    expect(pickProposalToShow([row({}), row({ id: 'c', status: 'shown', shown_count: 1, shown_at: '2026-10-12T11:55:00Z' })], [], now)).toBeNull();
  });
  it('skips proposals already in the plan', () => {
    expect(pickProposalToShow([row({})], ['הליכה של 10 דקות אחרי ארוחת הערב'], now)).toBeNull();
  });
  it('stops after two shows and after 7 days', () => {
    expect(pickProposalToShow([row({ shown_count: 2, shown_at: '2026-10-10T00:00:00Z' })], [], now)).toBeNull();
    expect(pickProposalToShow([row({ created_at: '2026-10-01T00:00:00Z' })], [], now)).toBeNull();
  });
});
