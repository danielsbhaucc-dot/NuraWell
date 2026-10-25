import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMonthsUtc, computePurgeAt, decideRetentionAction, recordRetentionChoice, runSubscriptionRetention,
} from '@/lib/privacy/subscription-retention';

const mig = readFileSync(join(__dirname, '../../../supabase/migrations/000187_subscription_retention.sql'), 'utf8');

describe('purge timing', () => {
  const end = new Date('2026-01-31T10:00:00Z');
  it('delete_now purges at ended_at', () => expect(computePurgeAt('delete_now', end).toISOString()).toBe(end.toISOString()));
  it('keep_24m purges 24 months later (month-end safe)', () => {
    expect(computePurgeAt('keep_24m', end).toISOString()).toBe('2028-01-31T10:00:00.000Z');
    expect(addMonthsUtc(new Date('2026-03-31T00:00:00Z'), 1).toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });
  it('no choice defaults to keep_24m', () => expect(computePurgeAt(null, end).toISOString()).toBe('2028-01-31T10:00:00.000Z'));
  it('decides remind ~30 days before, once', () => {
    const c = { ended_at: '2026-01-01T00:00:00Z', choice: 'keep_24m' as const, reminder_sent: false };
    expect(decideRetentionAction(c, new Date('2027-11-01T00:00:00Z'))).toBe('none');
    expect(decideRetentionAction(c, new Date('2027-12-05T00:00:00Z'))).toBe('remind');
    expect(decideRetentionAction({ ...c, reminder_sent: true }, new Date('2027-12-05T00:00:00Z'))).toBe('none');
    expect(decideRetentionAction(c, new Date('2028-01-01T00:00:00Z'))).toBe('purge');
  });
  it('delete_now purges on the next run, no reminder', () => {
    expect(decideRetentionAction({ ended_at: '2026-10-24T00:00:00Z', choice: 'delete_now', reminder_sent: false }, new Date('2026-10-25T00:00:00Z'))).toBe('purge');
  });
});

function fakeDb(rows: unknown[], opts: { dupNotice?: boolean } = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown> }[] = [];
  const db = {
    rpc: vi.fn(async () => ({ data: rows, error: null })),
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        const r = { error: table === 'billing_events' && opts.dupNotice ? { code: '23505', message: 'dup' } : null };
        return Object.assign(Promise.resolve(r), { then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => Promise.resolve(r).then(a, b) });
      },
      update: (row: Record<string, unknown>) => { updates.push({ table, row }); return { eq: async () => ({ error: null }) }; },
    }),
  };
  return { db: db as never, inserts, updates };
}

describe('runSubscriptionRetention', () => {
  const now = new Date('2026-10-25T01:00:00Z');
  const rows = [
    { user_id: 'a', subscription_id: 's1', ended_at: '2026-10-20T00:00:00Z', choice: 'delete_now', role: 'test', reminder_sent: false },
    { user_id: 'b', subscription_id: 's2', ended_at: '2024-11-20T00:00:00Z', choice: 'keep_24m', role: 'user', reminder_sent: false },
    { user_id: 'c', subscription_id: 's3', ended_at: '2026-10-01T00:00:00Z', choice: 'keep_24m', role: 'user', reminder_sent: false },
    { user_id: 'x', subscription_id: 's4', ended_at: '2020-01-01T00:00:00Z', choice: 'delete_now', role: 'admin', reminder_sent: false },
  ];
  it('purges, reminds once, never touches admins, audits counts only', async () => {
    const { db, inserts } = fakeDb(rows);
    const deleteAccount = vi.fn(async () => ({ ok: true }));
    const notify = vi.fn(async () => undefined);
    const out = await runSubscriptionRetention(db, { now, deps: { deleteAccount, notify, isEligibleForNotice: async () => true } });
    expect(deleteAccount.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['a']);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ purged: 1, reminded: 1, failed: 0, candidates: 4 });
    const audit = inserts.find((i) => i.table === 'admin_audit_log')!;
    expect(JSON.stringify(audit.row)).not.toMatch(/"a"|"b"|s1|s2/);
  });
  it('dry run deletes nothing and notifies nobody', async () => {
    const { db } = fakeDb(rows);
    const deleteAccount = vi.fn(async () => ({ ok: true }));
    const notify = vi.fn(async () => undefined);
    const out = await runSubscriptionRetention(db, { now, dryRun: true, deps: { deleteAccount, notify, isEligibleForNotice: async () => true } });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(out).toMatchObject({ purged: 1, reminded: 1 });
  });
  it('idempotent reminder: existing notice row means no second notification', async () => {
    const { db } = fakeDb([rows[1]], { dupNotice: true });
    const notify = vi.fn(async () => undefined);
    const out = await runSubscriptionRetention(db, { now, deps: { deleteAccount: async () => ({ ok: true }), notify, isEligibleForNotice: async () => true } });
    expect(notify).not.toHaveBeenCalled();
    expect(out.reminded).toBe(0);
  });
  it('test/admin accounts get no notification even when reminded', async () => {
    const { db } = fakeDb([rows[1]]);
    const notify = vi.fn(async () => undefined);
    await runSubscriptionRetention(db, { now, deps: { deleteAccount: async () => ({ ok: true }), notify, isEligibleForNotice: async () => false } });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('choice recording', () => {
  it('writes a consent row with choice + text version, then caches on profile', async () => {
    const { db, inserts, updates } = fakeDb([]);
    const r = await recordRetentionChoice(db, { userId: 'u', choice: 'delete_now', source: 'settings', previous: 'keep_24m' });
    expect(r.ok).toBe(true);
    const c = inserts.find((i) => i.table === 'user_consents')!.row;
    expect(c).toMatchObject({ consent_type: 'post_subscription_retention', granted: true, source: 'settings' });
    expect(c.metadata).toMatchObject({ choice: 'delete_now', previous: 'keep_24m' });
    expect(updates[0].row).toMatchObject({ post_sub_retention: 'delete_now' });
  });
  it('rejects unknown choices', async () => {
    const { db } = fakeDb([]);
    expect((await recordRetentionChoice(db, { userId: 'u', choice: 'forever' as never, source: 'settings' })).ok).toBe(false);
  });
});

describe('migration 000187', () => {
  it('only the latest subscription counts (resubscribe cancels) and admins are excluded', () => {
    expect(mig).toMatch(/distinct on \(s\.user_id\)[\s\S]*order by s\.user_id, s\.created_at desc/);
    expect(mig).toMatch(/l\.status = 'expired'/);
    expect(mig).toMatch(/in \('user','test'\)/);
  });
  it('choice survives deletion in consent_history', () => expect(mig).toMatch(/consent_history add column if not exists choice/));
  it('per-user key cascades on account deletion (crypto-shred)', () => {
    const k = readFileSync(join(__dirname, '../../../supabase/migrations/000179_user_data_keys.sql'), 'utf8');
    expect(k).toMatch(/references auth\.users\(id\) on delete cascade/);
  });
});
