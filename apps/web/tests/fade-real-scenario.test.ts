import { describe, expect, it } from 'vitest';
import { evaluateNotifyGate } from '../lib/notifications/notify-recipients';

/** Real prod pattern found 2026-10-11: user inactive since Oct 4 still got 3 checkpoints/day before #71. */
function admin(profile: Record<string, unknown>, touches: string[]) {
  const q = (rows: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gt', 'limit', 'order']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: rows, error: null });
    c.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
    return c;
  };
  return {
    from: (t: string) =>
      t === 'profiles' ? q(profile) : q(touches.map((created_at) => ({ created_at, metadata: { source: 'almog_habit_checkpoint' } }))),
  };
}
const profile = { id: 'u', role: 'user', notification_prefs: { daily_reminder: true }, last_active_at: '2026-10-04T14:40:33Z', last_responded_at: null };

describe('fade rule on the real prod scenario', () => {
  it('inactive 8 days, already nudged this week → blocked (weekly)', async () => {
    const r = await evaluateNotifyGate(admin(profile, ['2026-10-09T05:00:00Z']) as never, 'u', { now: new Date('2026-10-12T15:00:00Z') });
    expect(r).toMatchObject({ ok: false, reason: 'inactivity_fade' });
  });
  it('the 13:00 send on Oct 11 (after the 08:01 one) must be blocked', async () => {
    const r = await evaluateNotifyGate(admin(profile, ['2026-10-11T05:01:00Z']) as never, 'u', { now: new Date('2026-10-11T10:00:00Z') });
    expect(r).toMatchObject({ ok: false, reason: 'inactivity_fade' });
  });
  it('inactive 5 days, already nudged today → blocked (max once/day)', async () => {
    const r = await evaluateNotifyGate(admin(profile, ['2026-10-09T05:01:00Z']) as never, 'u', { now: new Date('2026-10-09T10:00:00Z') });
    expect(r).toMatchObject({ ok: false, reason: 'inactivity_fade' });
  });
  it('inactive 5 days, nothing today → one allowed', async () => {
    const r = await evaluateNotifyGate(admin(profile, ['2026-10-08T05:01:00Z']) as never, 'u', { now: new Date('2026-10-09T10:00:00Z') });
    expect(r.ok).toBe(true);
  });
});

describe('crisis safety pause', () => {
  it('blocks all automatic nudges while notify_paused_until is in the future', async () => {
    const p = { ...profile, last_active_at: '2026-10-11T09:00:00Z', notify_paused_until: '2026-10-13T00:00:00Z' };
    const r = await evaluateNotifyGate(admin(p, []) as never, 'u', { now: new Date('2026-10-11T10:00:00Z') });
    expect(r).toMatchObject({ ok: false, reason: 'safety_pause' });
    const after = await evaluateNotifyGate(admin(p, []) as never, 'u', { now: new Date('2026-10-14T10:00:00Z') });
    expect(after.ok).toBe(true);
  });
});
