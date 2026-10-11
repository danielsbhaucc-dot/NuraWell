import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  countNotifyEligibleProfiles,
  filterNotifyEligibleUserIds,
  isNotifyEligibleProfile,
  notifyEligibleOrFilter,
  parseNotifyTestUserIds,
} from '../lib/notifications/notify-recipients';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseNotifyTestUserIds', () => {
  it('parses comma/space separated uuids, dedupes, drops junk', () => {
    expect(parseNotifyTestUserIds(`${A}, ${B.toUpperCase()} ${A};nope`)).toEqual([A, B]);
    expect(parseNotifyTestUserIds('')).toEqual([]);
    expect(parseNotifyTestUserIds(undefined)).toEqual([]);
  });
});

describe('isNotifyEligibleProfile', () => {
  it('regular users always eligible', () => {
    expect(isNotifyEligibleProfile({ id: A, role: 'user' }, [])).toBe(true);
    expect(isNotifyEligibleProfile({ id: A, role: null }, [])).toBe(true);
  });
  it('admins excluded unless opted in via flag or env allowlist', () => {
    expect(isNotifyEligibleProfile({ id: A, role: 'admin' }, [])).toBe(false);
    expect(isNotifyEligibleProfile({ id: A, role: 'admin', notify_test_opt_in: true }, [])).toBe(true);
    expect(isNotifyEligibleProfile({ id: A, role: 'admin' }, [A])).toBe(true);
  });
});

describe('notifyEligibleOrFilter', () => {
  it('builds PostgREST or-filter', () => {
    expect(notifyEligibleOrFilter([])).toBe('role.neq.admin,role.is.null,notify_test_opt_in.eq.true');
    expect(notifyEligibleOrFilter([A], { withOptInColumn: false })).toBe(
      `role.neq.admin,role.is.null,id.in.(${A})`
    );
  });
});

function mockProfiles(rows: Array<{ id: string; role: string; notify_test_opt_in?: boolean }>, opts: { noOptInColumn?: boolean; fail?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    from: () => ({
      select: (cols: string, selOpts?: { head?: boolean }) => {
        calls.push(cols);
        const missing = opts.noOptInColumn && cols.includes('notify_test_opt_in');
        if (selOpts?.head) {
          return {
            eq: function () {
              return this;
            },
            or: (f: string) => {
              calls.push(`or:${f}`);
              if (opts.fail) return Promise.resolve({ count: null, error: { message: 'boom' } });
              if (opts.noOptInColumn && f.includes('notify_test_opt_in'))
                return Promise.resolve({ count: null, error: { code: '42703', message: 'column notify_test_opt_in does not exist' } });
              return Promise.resolve({ count: rows.filter((r) => r.role !== 'admin' || r.notify_test_opt_in).length, error: null });
            },
          };
        }
        return {
          in: (_c: string, ids: string[]) => {
            if (opts.fail) return Promise.resolve({ data: null, error: { message: 'boom' } });
            if (missing) return Promise.resolve({ data: null, error: { code: '42703', message: 'notify_test_opt_in' } });
            return Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null });
          },
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('filterNotifyEligibleUserIds (due-user scoping)', () => {
  const rows = [
    { id: A, role: 'user' },
    { id: B, role: 'admin' },
    { id: C, role: 'admin', notify_test_opt_in: true },
  ];
  it('drops admins, keeps opted-in test admin, preserves order', async () => {
    const { client } = mockProfiles(rows);
    expect(await filterNotifyEligibleUserIds(client, [C, A, B])).toEqual([C, A]);
  });
  it('env allowlist re-includes an admin', async () => {
    vi.stubEnv('NOTIFY_TEST_USER_IDS', B);
    const { client } = mockProfiles(rows);
    expect(await filterNotifyEligibleUserIds(client, [A, B])).toEqual([A, B]);
  });
  it('works before migration (no opt-in column)', async () => {
    const { client, calls } = mockProfiles(rows, { noOptInColumn: true });
    expect(await filterNotifyEligibleUserIds(client, [A, B])).toEqual([A]);
    expect(calls).toContain('id, role');
  });
  it('fail-open on DB error (same behavior as before)', async () => {
    const { client } = mockProfiles(rows, { fail: true });
    expect(await filterNotifyEligibleUserIds(client, [A, B])).toEqual([A, B]);
  });
  it('empty input → no query', async () => {
    const { client, calls } = mockProfiles(rows);
    expect(await filterNotifyEligibleUserIds(client, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('countNotifyEligibleProfiles (instant-exit guard)', () => {
  it('counts only eligible profiles', async () => {
    const { client } = mockProfiles([
      { id: A, role: 'admin' },
      { id: B, role: 'admin' },
    ]);
    expect(await countNotifyEligibleProfiles(client)).toBe(0);
  });
  it('falls back when opt-in column missing', async () => {
    const { client, calls } = mockProfiles([{ id: A, role: 'user' }], { noOptInColumn: true });
    expect(await countNotifyEligibleProfiles(client)).toBe(1);
    expect(calls.filter((c) => c.startsWith('or:'))).toHaveLength(2);
  });
  it('-1 on other errors (guard then stays active)', async () => {
    const { client } = mockProfiles([], { fail: true });
    expect(await countNotifyEligibleProfiles(client)).toBe(-1);
  });
});
