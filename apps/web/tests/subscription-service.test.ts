import { describe, it, expect } from 'vitest';
import { buildPatch, normalizeStatus } from '@/lib/billing/subscription-service';

const now = new Date('2026-10-25T00:00:00Z');
const base = { dunning_attempt: 0, dunning_first_failed_at: null };

describe('subscription-service buildPatch', () => {
  it('maps legacy expired to ended', () => expect(normalizeStatus('expired')).toBe('ended'));
  it('admin_end sets ended_at and clears dunning', () => {
    const r = buildPatch({ ...base, status: 'active' }, 'admin_end', now)!;
    expect(r.patch.status).toBe('ended');
    expect(r.patch.ended_at).toBe(now.toISOString());
    expect(r.patch.next_retry_at).toBeNull();
  });
  it('reactivate clears ended_at (cancels pending purge)', () => {
    const r = buildPatch({ ...base, status: 'expired' }, 'admin_reactivate', now)!;
    expect(r.patch.status).toBe('active');
    expect(r.patch.ended_at).toBeNull();
  });
  it('payment_failed schedules the first retry +3d', () => {
    const r = buildPatch({ ...base, status: 'active' }, 'payment_failed', now)!;
    expect(r.patch.status).toBe('past_due');
    expect(r.patch.dunning_attempt).toBe(1);
    expect(r.patch.next_retry_at).toBe(new Date('2026-10-28T00:00:00Z').toISOString());
  });
  it('invalid transition returns null', () => {
    expect(buildPatch({ ...base, status: 'ended' }, 'admin_end', now)).toBeNull();
  });
});
