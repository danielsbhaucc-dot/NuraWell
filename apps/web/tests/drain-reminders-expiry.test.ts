import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/notifications/deliver', () => ({ insertNotification: vi.fn() }));
vi.mock('../lib/ai/guardian/sos-care-loop', () => ({ skipSosFollowUpIfResolved: vi.fn(async () => true) }));
vi.mock('@/lib/ai/guardian/sos-care-loop', () => ({ skipSosFollowUpIfResolved: vi.fn(async () => true) }));
vi.mock('../lib/notifications/almog-touch-send-gate', () => ({ gateAlmogUserFacingTouch: vi.fn(async () => ({ ok: false })) }));
vi.mock('@/lib/notifications/almog-touch-send-gate', () => ({ gateAlmogUserFacingTouch: vi.fn(async () => ({ ok: false })) }));

import { insertNotification } from '@/lib/notifications/deliver';
import { drainAlmogReminders, isExpiredReminder } from '@/lib/ai/almog-commitments/drain-reminders';

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

const now = new Date('2026-10-27T12:00:00Z');
const row = (fire_at: string) => ({
  id: 'r1', user_id: 'u1', fire_at, kind: 'followup', title: 't', body: 'b',
  assignment_id: null, blocker_id: null, metadata: { source: 'almog_commitment' },
});

describe('drain reminders — stale expiry', () => {
  it('flags reminders >24h past due only', () => {
    expect(isExpiredReminder('2026-10-14T10:00:00Z', now)).toBe(true);
    expect(isExpiredReminder('2026-10-26T13:00:00Z', now)).toBe(false);
  });

  it('expires a long-stuck reminder (blocked by touch cap) without sending', async () => {
    const { admin, updates } = fakeAdmin([row('2026-10-14T10:00:04Z')]);
    const res = await drainAlmogReminders(admin, { now });
    expect(insertNotification).not.toHaveBeenCalled();
    expect(res.expired).toBe(1);
    expect(res.deferred).toBe(0);
    const u = updates.find((x) => x.table === 'scheduled_reminders');
    expect(u?.status).toBe('skipped');
    expect((u?.metadata as Record<string, unknown>)?.skip_reason).toBe('expired');
  });

  it('keeps a recent capped reminder pending (deferred)', async () => {
    const { admin, updates } = fakeAdmin([row('2026-10-27T10:00:00Z')]);
    const res = await drainAlmogReminders(admin, { now });
    expect(res.expired).toBe(0);
    expect(res.deferred).toBe(1);
    expect(updates.some((x) => x.table === 'scheduled_reminders')).toBe(false);
  });
});
