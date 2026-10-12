import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/notifications/deliver', () => ({ insertNotification: vi.fn() }));
vi.mock('@/lib/ai/guardian/sos-care-loop', () => ({ skipSosFollowUpIfResolved: vi.fn(async () => true) }));
vi.mock('../lib/ai/guardian/sos-care-loop', () => ({ skipSosFollowUpIfResolved: vi.fn(async () => true) }));
vi.mock('../lib/notifications/almog-touch-send-gate', () => ({ gateAlmogUserFacingTouch: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notifications/almog-touch-send-gate', () => ({ gateAlmogUserFacingTouch: vi.fn(async () => ({ ok: true })) }));

import { insertNotification } from '@/lib/notifications/deliver';
import { drainAlmogReminders, isStaleSosFollowUp } from '@/lib/ai/almog-commitments/drain-reminders';

function fakeAdmin(rows: unknown[]) {
  const updates: Array<Record<string, unknown>> = [];
  const chain = (table: string): Record<string, unknown> => {
    let pendingUpdate: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ['select', 'eq', 'lte', 'order', 'in']) q[m] = vi.fn(self);
    q.update = vi.fn((u: Record<string, unknown>) => { pendingUpdate = u; updates.push({ table, ...u }); return q; });
    q.limit = vi.fn(async () => ({ data: rows, error: null }));
    q.then = (res: (v: unknown) => unknown) => res({ data: pendingUpdate ? [] : rows, error: null });
    return q;
  };
  return { admin: { from: vi.fn(chain), rpc: vi.fn(async () => ({})) } as never, updates };
}

const now = new Date('2026-10-12T20:00:00Z');
const row = (fire_at: string, source = 'sos_followup') => ({
  id: 'r1', user_id: 'u1', fire_at, kind: 'followup', title: 't', body: 'b',
  assignment_id: null, blocker_id: null, metadata: { source, event_id: 'e1' },
});

describe('drain reminders — SOS & dedupe', () => {
  it('detects stale SOS follow-ups', () => {
    expect(isStaleSosFollowUp('2026-10-12T16:00:00Z', now)).toBe(true);
    expect(isStaleSosFollowUp('2026-10-12T19:30:00Z', now)).toBe(false);
  });

  it('skips stale SOS follow-up without sending', async () => {
    const { admin, updates } = fakeAdmin([row('2026-10-12T09:00:00Z')]);
    const res = await drainAlmogReminders(admin, { now });
    expect(insertNotification).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
    expect(updates.some((u) => u.table === 'scheduled_reminders' && u.status === 'skipped')).toBe(true);
  });

  it('treats unique violation as already sent → skipped, no error', async () => {
    vi.mocked(insertNotification).mockResolvedValueOnce({
      data: null, error: { message: 'duplicate key uq_notifications_dedupe_day', code: '23505' }, deduped: true,
    });
    const { admin, updates } = fakeAdmin([row('2026-10-12T19:50:00Z', 'almog_commitment')]);
    const res = await drainAlmogReminders(admin, { now });
    expect(res.errors_count).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.sent).toBe(0);
    expect(updates.some((u) => u.status === 'skipped')).toBe(true);
  });
});
